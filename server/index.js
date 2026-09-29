import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import express from 'express';
import { MODELS, defaultsFor, getModel } from './models.js';
import { OUTPUTS_DIR, PUBLIC_DIR, TMP_DIR, VOICES_DIR, modelReadiness } from './paths.js';
import { SerialQueue } from './queue.js';
import * as store from './store.js';
import { textForModel } from './tags.js';
import { runWorker } from './worker.js';

const PORT = Number(process.env.PORT) || 5178;
const MAX_TEXT = 3000;
const execFileAsync = promisify(execFile);

const app = express();
app.use(express.json({ limit: '80mb' }));
app.use(express.static(PUBLIC_DIR));
app.use('/outputs', express.static(OUTPUTS_DIR));

mkdirSync(TMP_DIR, { recursive: true });
const queue = new SerialQueue();
const runs = new Map(store.loadRuns().map((r) => [r.id, r]));

// Corridas que quedaron a medias si el servidor se cerró durante una generación.
for (const run of runs.values()) {
  let dirty = false;
  for (const r of Object.values(run.results)) {
    if (!['done', 'error', 'cancelled'].includes(r.status)) {
      Object.assign(r, { status: 'cancelled', message: 'Interrumpido al reiniciar el servidor' });
      dirty = true;
    }
  }
  if (dirty) store.saveRun(run);
}

// ---------- Eventos en vivo (SSE) ----------

const clients = new Set();
function broadcast(type, payload) {
  const data = `event: ${type}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const res of clients) res.write(data);
}
queue.on('change', () => broadcast('queue', queue.snapshot()));

app.get('/api/events', (req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  res.write(`event: queue\ndata: ${JSON.stringify(queue.snapshot())}\n\n`);
  clients.add(res);
  const ping = setInterval(() => res.write(': ping\n\n'), 25000);
  req.on('close', () => {
    clearInterval(ping);
    clients.delete(res);
  });
});

// ---------- Modelos y sistema ----------

app.get('/api/models', (req, res) => {
  res.json(MODELS.map((m) => ({ ...m, defaults: defaultsFor(m), ...modelReadiness(m) })));
});

app.get('/api/system', (req, res) => {
  res.json({ totalMemGb: os.totalmem() / 1e9, freeMemGb: os.freemem() / 1e9, cpu: os.cpus()[0]?.model, queue: queue.snapshot() });
});

// ---------- Corridas ----------

const updateRun = (run) => {
  store.saveRun(run);
  broadcast('run', run);
};

function shuffle(list) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

app.get('/api/runs', (req, res) => res.json([...runs.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt))));

app.get('/api/runs/:id', (req, res) => {
  const run = runs.get(req.params.id);
  run ? res.json(run) : res.status(404).json({ error: 'No existe' });
});

app.post('/api/runs', (req, res) => {
  const { text, models: requested = [], voiceId, blind = false } = req.body ?? {};
  const cleanText = String(text ?? '').trim();
  if (!cleanText) return res.status(400).json({ error: 'Escribe un texto.' });
  if (cleanText.length > MAX_TEXT) return res.status(400).json({ error: `Máximo ${MAX_TEXT} caracteres.` });
  if (!requested.length) return res.status(400).json({ error: 'Selecciona al menos un modelo.' });

  const voice = voiceId ? store.getVoice(voiceId) : null;
  if (voiceId && !voice) return res.status(400).json({ error: 'La voz de referencia no existe.' });

  const results = {};
  for (const reqModel of requested) {
    const model = getModel(reqModel.id);
    if (!model) return res.status(400).json({ error: `Modelo desconocido: ${reqModel.id}` });
    const readiness = modelReadiness(model);
    if (!readiness.ready) return res.status(400).json({ error: `${model.name}: ${readiness.reason}` });
    // Solo se aceptan parámetros declarados en el catálogo.
    const params = defaultsFor(model);
    for (const p of model.params) if (reqModel.params?.[p.key] !== undefined) params[p.key] = reqModel.params[p.key];
    results[model.id] = {
      model: model.id,
      params,
      useReference: Boolean(voice && reqModel.useReference !== false),
      status: 'queued',
      message: 'En cola',
      log: [],
    };
  }

  const order = Object.keys(results);
  const run = {
    id: `${new Date().toISOString().replace(/[:.]/g, '-')}_${randomUUID().slice(0, 6)}`,
    createdAt: new Date().toISOString(),
    text: cleanText,
    voice: voice ? { id: voice.id, name: voice.name } : null,
    blind: Boolean(blind),
    // En modo ciego el orden se baraja y la UI muestra "Modelo A, B, C…".
    order: blind ? shuffle(order) : order,
    results,
    vote: null,
  };
  runs.set(run.id, run);
  updateRun(run);
  enqueueRun(run, voice);
  res.status(201).json(run);
});

function enqueueRun(run, voice) {
  // Una tarea por modelo: la cola garantiza que nunca haya dos modelos cargados a la vez.
  for (const modelId of Object.keys(run.results)) {
    const model = getModel(modelId);
    queue.push({
      id: run.id,
      label: `${model.name}`,
      run: (ctx) => executeModel(run, model, voice, ctx),
    });
  }
}

async function executeModel(run, model, voice, ctx) {
  const result = run.results[model.id];
  if (ctx.cancelled) return;
  const set = (patch) => {
    Object.assign(result, patch);
    updateRun(run);
  };
  set({ status: 'loading', message: 'Iniciando proceso…', startedAt: new Date().toISOString() });

  const dir = store.runDir(run.id);
  const fileName = `${model.id}.wav`;
  // Modelos que siempre clonan (CosyVoice3) usan la voz incluida cuando no hay referencia.
  const ref = result.useReference ? voice : model.reference.fallbackVoice ? store.getVoice(model.reference.fallbackVoice) : null;
  if (!ref && model.reference.fallbackVoice) {
    set({ status: 'error', message: 'Este modelo necesita una voz de referencia. Elige una o ejecuta: npm run download -- voices', finishedAt: new Date().toISOString() });
    return;
  }
  const job = {
    model: model.id,
    // Cada modelo recibe las etiquetas del guion traducidas a su formato (o eliminadas).
    text: textForModel(model.id, run.text),
    params: result.params,
    ref_audio: ref?.file ?? null,
    ref_text: ref?.transcript || null,
    output_path: join(dir, fileName),
  };
  if (!job.text) {
    set({ status: 'error', message: 'El texto queda vacío sin las etiquetas.', finishedAt: new Date().toISOString() });
    return;
  }

  const worker = runWorker({
    env: model.env,
    script: model.worker,
    job,
    jobPath: join(dir, `job_${model.id}.json`),
    onEvent: (evt) => set({ status: evt.stage ?? result.status, message: evt.message ?? result.message }),
    onLog: (line) => {
      result.log = [...result.log.slice(-60), line];
    },
  });
  ctx.cancel = worker.kill;

  try {
    const metrics = await worker.promise;
    delete metrics.event;
    set({ status: 'done', message: 'Listo', metrics, audioUrl: `/outputs/${run.id}/${fileName}`, finishedAt: new Date().toISOString() });
  } catch (err) {
    const cancelled = ctx.cancelled;
    set({ status: cancelled ? 'cancelled' : 'error', message: cancelled ? 'Cancelado' : err.message, finishedAt: new Date().toISOString() });
  }
}

app.post('/api/runs/:id/cancel', (req, res) => {
  const run = runs.get(req.params.id);
  if (!run) return res.status(404).json({ error: 'No existe' });
  queue.cancel(run.id);
  for (const r of Object.values(run.results)) {
    if (r.status === 'queued') Object.assign(r, { status: 'cancelled', message: 'Cancelado' });
  }
  updateRun(run);
  res.json(run);
});

app.post('/api/runs/:id/vote', (req, res) => {
  const run = runs.get(req.params.id);
  if (!run) return res.status(404).json({ error: 'No existe' });
  const { winner } = req.body ?? {};
  if (winner !== 'tie' && run.results[winner]?.status !== 'done') {
    return res.status(400).json({ error: 'Voto inválido.' });
  }
  run.vote = { winner, at: new Date().toISOString() };
  updateRun(run);
  res.json(run);
});

app.delete('/api/runs/:id', (req, res) => {
  const run = runs.get(req.params.id);
  if (!run) return res.status(404).json({ error: 'No existe' });
  queue.cancel(run.id);
  runs.delete(run.id);
  store.deleteRun(run.id);
  broadcast('run-deleted', { id: run.id });
  res.json({ ok: true });
});

// Ranking: victorias sobre corridas votadas con al menos dos modelos terminados.
app.get('/api/leaderboard', (req, res) => {
  const stats = Object.fromEntries(
    MODELS.map((m) => [m.id, { id: m.id, name: m.name, wins: 0, battles: 0, ties: 0, rtf: [], blindWins: 0 }]),
  );
  for (const run of runs.values()) {
    const finished = Object.values(run.results).filter((r) => r.status === 'done');
    for (const r of finished) if (r.metrics?.rtf) stats[r.model]?.rtf.push(r.metrics.rtf);
    if (!run.vote || finished.length < 2) continue;
    for (const r of finished) {
      const s = stats[r.model];
      if (!s) continue;
      s.battles += 1;
      if (run.vote.winner === 'tie') s.ties += 1;
      if (run.vote.winner === r.model) {
        s.wins += 1;
        if (run.blind) s.blindWins += 1;
      }
    }
  }
  const rows = Object.values(stats).map((s) => ({
    ...s,
    winRate: s.battles ? s.wins / s.battles : null,
    avgRtf: s.rtf.length ? s.rtf.reduce((a, b) => a + b, 0) / s.rtf.length : null,
    rtf: undefined,
  }));
  rows.sort((a, b) => (b.winRate ?? -1) - (a.winRate ?? -1) || b.wins - a.wins);
  res.json(rows);
});

// ---------- Voces de referencia ----------

const EXT_BY_MIME = { 'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/mp4': 'm4a', 'audio/mpeg': 'mp3', 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/flac': 'flac' };

app.get('/api/voices', (req, res) => res.json(store.listVoices().map(({ file, ...v }) => v)));

app.get('/api/voices/:id/audio', (req, res) => {
  const voice = store.getVoice(req.params.id);
  voice && existsSync(voice.file) ? res.sendFile(voice.file) : res.status(404).end();
});

app.post('/api/voices', async (req, res) => {
  const { name, audioBase64, mime = 'audio/wav', transcript = '' } = req.body ?? {};
  if (!name?.trim() || !audioBase64) return res.status(400).json({ error: 'Nombre y audio son obligatorios.' });
  const id = `v_${randomUUID().slice(0, 8)}`;
  const baseMime = mime.split(';')[0];
  const tmp = join(VOICES_DIR, `${id}.upload.${EXT_BY_MIME[baseMime] ?? 'bin'}`);
  const file = join(VOICES_DIR, `${id}.wav`);
  try {
    writeFileSync(tmp, Buffer.from(audioBase64, 'base64'));
    // Normaliza a WAV mono 44.1 kHz y recorta a 30 s: los modelos solo usan los primeros segundos.
    await execFileAsync('ffmpeg', ['-y', '-loglevel', 'error', '-i', tmp, '-ac', '1', '-ar', '44100', '-t', '30', file]);
    const { stdout } = await execFileAsync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]);
    const voice = store.saveVoice({ id, name: name.trim(), file, transcript: transcript.trim(), duration: Number(stdout) || null, createdAt: new Date().toISOString() });
    const { file: _f, ...pub } = voice;
    res.status(201).json(pub);
  } catch (err) {
    res.status(400).json({ error: `No se pudo procesar el audio: ${err.message}` });
  } finally {
    rmSync(tmp, { force: true });
  }
});

app.patch('/api/voices/:id', (req, res) => {
  const voice = store.getVoice(req.params.id);
  if (!voice || voice.builtin) return res.status(404).json({ error: 'Voz no editable.' });
  if (typeof req.body?.name === 'string' && req.body.name.trim()) voice.name = req.body.name.trim();
  if (typeof req.body?.transcript === 'string') voice.transcript = req.body.transcript.trim();
  store.saveVoice(voice);
  const { file, ...pub } = voice;
  res.json(pub);
});

app.delete('/api/voices/:id', (req, res) => {
  store.deleteVoice(req.params.id) ? res.json({ ok: true }) : res.status(404).json({ error: 'Voz no eliminable.' });
});

// La transcripción también carga un modelo (Whisper), así que pasa por la misma cola.
app.post('/api/voices/:id/transcribe', (req, res) => {
  const voice = store.getVoice(req.params.id);
  if (!voice) return res.status(404).json({ error: 'No existe' });
  const jobPath = join(TMP_DIR, `transcribe_${voice.id}.json`);
  let settled = false;
  queue.push({
    id: `transcribe:${voice.id}`,
    label: `Transcribir "${voice.name}"`,
    run: async (ctx) => {
      const worker = runWorker({ env: 'mlx', script: 'transcribe_worker.py', job: { audio_path: voice.file, language: 'es' }, jobPath });
      ctx.cancel = worker.kill;
      try {
        const { text } = await worker.promise;
        if (!voice.builtin) store.saveVoice({ ...voice, transcript: text });
        settled = true;
        res.json({ transcript: text });
      } catch (err) {
        settled = true;
        res.status(500).json({ error: err.message });
      }
    },
  });
  res.on('close', () => {
    if (!settled) queue.cancel(`transcribe:${voice.id}`);
  });
});

// Al cerrar (Ctrl+C o reinicio de --watch) se mata el worker en curso para no dejar
// un modelo huérfano ocupando memoria.
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    if (queue.current) queue.cancel(queue.current.id);
    process.exit(0);
  });
}

app.listen(PORT, () => {
  console.log(`\n  TTS Arena Local → http://localhost:${PORT}\n`);
  for (const m of MODELS) {
    const r = modelReadiness(m);
    console.log(`  ${r.ready ? '✓' : '✗'} ${m.name}${r.ready ? '' : ` — ${r.reason}`}`);
  }
  console.log('');
});

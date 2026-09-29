const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k in el) el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) if (c !== null && c !== undefined && c !== false) el.append(c instanceof Node ? c : String(c));
  return el;
}

async function api(path, options = {}) {
  const res = await fetch(path, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers },
    body: options.body && typeof options.body !== 'string' ? JSON.stringify(options.body) : options.body,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
  return data;
}

const STATUS_TEXT = {
  queued: 'En cola',
  loading: 'Cargando modelo',
  loaded: 'Modelo cargado',
  generating: 'Generando',
  done: 'Listo',
  error: 'Error',
  cancelled: 'Cancelado',
};
const ACTIVE = new Set(['queued', 'loading', 'loaded', 'generating']);
const LETTERS = 'ABCDEFGH';

const SAMPLES = [
  ['Saludo', '¡Hola! ¿Qué onda? Hoy hace un clima padrísimo para salir a caminar.'],
  ['Narración', 'Aquella tarde, cuando el sol ya se escondía detrás de los cerros, Mariana entendió que no había vuelta atrás. Respiró hondo, tomó la carta y salió sin mirar atrás.'],
  ['Atención al cliente', 'Gracias por comunicarte con nosotros. Tu pedido número cuatro mil ciento veintiséis ya fue despachado y llegará entre el martes y el jueves.'],
  ['Expresivo (Fish)', 'No te lo vas a creer [laughing] ¡me gané el primer lugar! [short pause] [whisper] Pero no se lo digas a nadie todavía.'],
  ['Números y siglas', 'El 15 de septiembre de 2026 la inflación en México cerró en 3,8 % según el INEGI, y el dólar se cotizó en 17,45 pesos.'],
];

const state = {
  models: [],
  voices: [],
  runs: new Map(),
  currentRunId: null,
  settings: loadSettings(),
};

// ---------- Preferencias locales ----------

function loadSettings() {
  try {
    return JSON.parse(localStorage.getItem('tts-arena-settings')) || {};
  } catch {
    return {};
  }
}
function saveSettings() {
  try {
    localStorage.setItem('tts-arena-settings', JSON.stringify(state.settings));
  } catch {
    /* almacenamiento no disponible: se usan los valores en memoria */
  }
}
function modelSettings(model) {
  const s = (state.settings.models ??= {});
  const current = (s[model.id] ??= { enabled: model.ready, useReference: true, params: {} });
  current.params = { ...model.defaults, ...current.params };
  return current;
}

// ---------- Tabs ----------

function showTab(name) {
  for (const t of $$('.tab')) t.setAttribute('aria-selected', String(t.dataset.tab === name));
  for (const v of $$('.view')) v.hidden = v.id !== `view-${name}`;
  if (name === 'history') renderHistory();
  if (name === 'ranking') renderRanking();
  if (name === 'voices') renderVoices();
}
$$('.tab').forEach((t) => t.addEventListener('click', () => showTab(t.dataset.tab)));
$$('[data-goto]').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.goto)));

// ---------- Compositor ----------

const textEl = $('#text');
textEl.value = state.settings.text ?? '';
function updateCounter() {
  $('#counter').textContent = `${textEl.value.length} / 3000`;
}
textEl.addEventListener('input', () => {
  state.settings.text = textEl.value;
  saveSettings();
  updateCounter();
  updateGenerateButton();
});
updateCounter();

$('#samples').append(
  ...SAMPLES.map(([label, text]) =>
    h('button', { class: 'chip', type: 'button', onclick: () => { textEl.value = text; textEl.dispatchEvent(new Event('input')); } }, label),
  ),
);

$('#blind').checked = Boolean(state.settings.blind);
$('#blind').addEventListener('change', (e) => {
  state.settings.blind = e.target.checked;
  saveSettings();
});

// ---------- Voces en el compositor ----------

function renderVoiceSelect() {
  const select = $('#voice');
  const selected = state.settings.voiceId ?? state.voices[0]?.id ?? '';
  select.replaceChildren(
    h('option', { value: '' }, 'Sin referencia (voz por defecto de cada modelo)'),
    ...state.voices.map((v) => h('option', { value: v.id }, v.name)),
  );
  select.value = state.voices.some((v) => v.id === selected) ? selected : '';
  updateVoicePreview();
}
function updateVoicePreview() {
  const voice = state.voices.find((v) => v.id === $('#voice').value);
  const audio = $('#voice-preview');
  audio.hidden = !voice;
  if (voice) audio.src = `/api/voices/${voice.id}/audio`;
  $('#voice-transcript').textContent = voice
    ? voice.transcript
      ? `“${voice.transcript}”`
      : 'Sin transcripción: Qwen usará solo el timbre y Fish clonará con menos precisión.'
    : 'Chatterbox usará su voz integrada; Qwen y Fish generarán una voz aleatoria.';
}
$('#voice').addEventListener('change', (e) => {
  state.settings.voiceId = e.target.value;
  saveSettings();
  updateVoicePreview();
});

// ---------- Channel strips ----------

function formatValue(param, value) {
  if (param.type === 'slider') return Number(value).toFixed(param.step < 0.1 ? 2 : 1);
  return value;
}

function renderParam(model, param, settings) {
  const id = `p-${model.id}-${param.key}`;
  const value = settings.params[param.key];
  const set = (v) => {
    settings.params[param.key] = v;
    saveSettings();
  };
  const help = param.help ? h('p', { class: 'hint' }, param.help) : null;

  if (param.type === 'checkbox') {
    return h('div', { class: 'param check' },
      h('input', { type: 'checkbox', id, checked: Boolean(value), onchange: (e) => set(e.target.checked) }),
      h('label', { for: id }, param.label),
      help);
  }
  if (param.type === 'slider') {
    const out = h('output', { for: id }, formatValue(param, value));
    return h('div', { class: 'param' },
      h('div', { class: 'param-head' }, h('label', { for: id }, param.label), out),
      h('input', {
        type: 'range', id, min: param.min, max: param.max, step: param.step, value,
        oninput: (e) => { out.textContent = formatValue(param, e.target.value); set(Number(e.target.value)); },
      }),
      help);
  }
  if (param.type === 'select') {
    const sel = h('select', { id, onchange: (e) => set(e.target.value) }, ...param.options.map((o) => h('option', { value: o }, o)));
    sel.value = value;
    return h('div', { class: 'param' }, h('div', { class: 'param-head' }, h('label', { for: id }, param.label)), sel, help);
  }
  if (param.type === 'textarea') {
    return h('div', { class: 'param' },
      h('div', { class: 'param-head' }, h('label', { for: id }, param.label)),
      h('textarea', { id, rows: 2, value: value ?? '', oninput: (e) => set(e.target.value) }),
      help);
  }
  return h('div', { class: 'param' },
    h('div', { class: 'param-head' }, h('label', { for: id }, param.label)),
    h('input', { type: 'number', id, min: param.min, max: param.max, step: param.step, value, onchange: (e) => set(Number(e.target.value)) }),
    help);
}

function renderStrips() {
  const container = $('#strips');
  container.replaceChildren();
  for (const model of state.models) {
    const settings = modelSettings(model);
    const strip = $('#tpl-strip').content.firstElementChild.cloneNode(true);
    strip.dataset.model = model.id;
    $('.strip-name', strip).textContent = model.name;
    $('.strip-meta', strip).textContent = `${model.runtime}, ${model.size}, licencia ${model.license}`;
    $('.strip-summary', strip).textContent = model.summary;
    $('.ref-note', strip).textContent = model.reference.note;
    $('.text-hint', strip).textContent = model.textHint;

    const enabled = $('.enabled', strip);
    enabled.checked = settings.enabled && model.ready;
    enabled.disabled = !model.ready;
    strip.classList.toggle('off', !enabled.checked);
    enabled.addEventListener('change', () => {
      settings.enabled = enabled.checked;
      strip.classList.toggle('off', !enabled.checked);
      saveSettings();
      updateGenerateButton();
    });
    if (!model.ready) {
      const warn = $('.strip-unready', strip);
      warn.hidden = false;
      warn.textContent = model.reason;
    }

    const useRef = $('.use-ref', strip);
    useRef.checked = settings.useReference;
    useRef.addEventListener('change', () => {
      settings.useReference = useRef.checked;
      saveSettings();
    });

    const fill = () => {
      $('.params', strip).replaceChildren(...model.params.filter((p) => !p.advanced).map((p) => renderParam(model, p, settings)));
      $('.params-adv', strip).replaceChildren(...model.params.filter((p) => p.advanced).map((p) => renderParam(model, p, settings)));
    };
    fill();
    $('.reset', strip).addEventListener('click', () => {
      settings.params = { ...model.defaults };
      saveSettings();
      fill();
    });
    container.append(strip);
  }
  updateGenerateButton();
  renderCurrentRun();
}

function enabledModels() {
  return state.models.filter((m) => m.ready && modelSettings(m).enabled);
}

function isBusy() {
  const run = state.runs.get(state.currentRunId);
  return Boolean(run && Object.values(run.results).some((r) => ACTIVE.has(r.status)));
}

function updateGenerateButton() {
  const n = enabledModels().length;
  const btn = $('#generate');
  btn.textContent = n === 1 ? 'Generar con 1 modelo' : `Generar con ${n} modelos`;
  btn.disabled = n === 0 || !textEl.value.trim() || isBusy();
  $('#cancel').hidden = !isBusy();
}

// ---------- Generación ----------

function showError(msg) {
  const el = $('#error');
  el.hidden = !msg;
  el.textContent = msg ?? '';
}

$('#generate').addEventListener('click', async () => {
  showError(null);
  const voiceId = $('#voice').value || null;
  try {
    const run = await api('/api/runs', {
      method: 'POST',
      body: {
        text: textEl.value,
        voiceId,
        blind: $('#blind').checked,
        models: enabledModels().map((m) => {
          const s = modelSettings(m);
          return { id: m.id, params: s.params, useReference: s.useReference };
        }),
      },
    });
    state.runs.set(run.id, run);
    state.currentRunId = run.id;
    renderCurrentRun();
  } catch (err) {
    showError(err.message);
  }
});

$('#cancel').addEventListener('click', async () => {
  if (state.currentRunId) await api(`/api/runs/${state.currentRunId}/cancel`, { method: 'POST' }).catch((e) => showError(e.message));
});

function metricList(m) {
  if (!m) return [];
  const items = [
    ['Audio', `${m.audio_seconds} s`],
    ['Generación', `${m.gen_seconds} s`],
    ['RTF', m.rtf ?? '—'],
    ['Memoria pico', `${m.peak_memory_gb} GB`],
  ];
  return items.map(([k, v]) => h('div', {}, h('dt', {}, k), h('dd', {}, v)));
}

function renderCurrentRun() {
  const run = state.runs.get(state.currentRunId);
  for (const strip of $$('.strip')) {
    const out = $('.output', strip);
    const result = run?.results[strip.dataset.model];
    out.dataset.status = result?.status ?? 'idle';
    const hidden = run?.blind && !run.vote;
    $('.status-text', out).textContent = !result
      ? 'Sin generar'
      : hidden && result.status === 'done'
        ? 'Listo: escúchalo abajo, a ciegas'
        : result.status === 'error'
          ? result.message
          : result.message && ACTIVE.has(result.status) ? result.message : STATUS_TEXT[result.status];
    const audio = $('audio', out);
    const showAudio = result?.status === 'done' && !hidden;
    audio.hidden = !showAudio;
    if (showAudio && audio.dataset.src !== result.audioUrl) {
      audio.dataset.src = result.audioUrl;
      audio.src = result.audioUrl;
    }
    $('.metrics', out).replaceChildren(...(showAudio ? metricList(result.metrics) : []));
    const log = $('.log', out);
    log.hidden = !(result?.status === 'error' && result.log?.length);
    if (!log.hidden) $('pre', log).textContent = result.log.join('\n');
  }
  renderBlindPanel(run);
  updateGenerateButton();
}

function renderBlindPanel(run) {
  const panel = $('#blind-panel');
  if (!run?.blind) {
    panel.hidden = true;
    return;
  }
  panel.hidden = false;
  const done = run.order.filter((id) => run.results[id]?.status === 'done');
  const grid = $('#blind-grid');
  const voted = Boolean(run.vote);
  grid.replaceChildren(
    ...run.order.map((id, i) => {
      const r = run.results[id];
      const model = state.models.find((m) => m.id === id);
      const card = h('div', { class: `blind-card${run.vote?.winner === id ? ' winner' : ''}` },
        h('h3', {}, `Modelo ${LETTERS[i]}`),
        r.status === 'done'
          ? h('audio', { controls: true, preload: 'none', src: r.audioUrl })
          : h('p', { class: 'hint' }, STATUS_TEXT[r.status]),
        voted ? h('p', { class: 'reveal' }, model?.name ?? id) : null,
        !voted && r.status === 'done' && done.length >= 2
          ? h('button', { class: 'btn ghost small', onclick: () => vote(run.id, id) }, `Votar por ${LETTERS[i]}`)
          : null);
      return card;
    }),
  );
  const tie = !voted && done.length >= 2 && !Object.values(run.results).some((r) => ACTIVE.has(r.status));
  if (tie) grid.append(h('div', { class: 'blind-card' }, h('h3', {}, '='), h('p', { class: 'hint' }, 'Ninguno destaca.'), h('button', { class: 'btn ghost small', onclick: () => vote(run.id, 'tie') }, 'Empate')));
}

async function vote(runId, winner) {
  try {
    const run = await api(`/api/runs/${runId}/vote`, { method: 'POST', body: { winner } });
    state.runs.set(run.id, run);
    renderCurrentRun();
    if (!$('#view-history').hidden) renderHistory();
  } catch (err) {
    showError(err.message);
  }
}

// ---------- Cola (cadena de señal) ----------

function renderChain(queue) {
  const chain = $('#chain');
  const nodes = [];
  if (queue.current) nodes.push({ label: queue.current.label, live: true });
  for (const p of queue.pending) nodes.push({ label: p.label, live: false });
  if (!nodes.length) {
    chain.replaceChildren(h('span', { class: 'chain-idle' }, 'Sin tareas: ningún modelo en memoria'));
    return;
  }
  const out = [];
  nodes.forEach((n, i) => {
    if (i) out.push(h('span', { class: 'chain-wire', 'aria-hidden': 'true' }));
    out.push(h('span', { class: `chain-node ${n.live ? 'live' : 'pending'}`, title: n.live ? 'En memoria ahora' : 'En espera' }, h('span', { class: 'bulb' }), n.label));
  });
  chain.replaceChildren(...out);
}

// ---------- Historial ----------

function renderHistory() {
  const runs = [...state.runs.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const container = $('#history');
  if (!runs.length) {
    container.replaceChildren(h('p', { class: 'empty' }, 'Todavía no hay generaciones. Ve a Arena, escribe un texto y pulsa Generar.'));
    return;
  }
  container.replaceChildren(
    ...runs.map((run) => {
      const date = new Date(run.createdAt).toLocaleString('es', { dateStyle: 'medium', timeStyle: 'short' });
      const info = [date, run.voice ? `voz: ${run.voice.name}` : 'sin voz de referencia', run.blind ? 'a ciegas' : null, run.vote ? (run.vote.winner === 'tie' ? 'votado: empate' : 'votado') : null].filter(Boolean).join(', ');
      return h('article', { class: 'run' },
        h('div', { class: 'run-head' },
          h('div', {}, h('p', { class: 'run-text' }, run.text), h('p', { class: 'run-info' }, info)),
          h('div', { class: 'run-actions' },
            h('button', { class: 'link', onclick: () => reuseRun(run) }, 'Reutilizar configuración'),
            h('button', { class: 'link danger', onclick: () => deleteRun(run.id) }, 'Eliminar'))),
        h('div', { class: 'run-results' },
          ...Object.values(run.results).map((r) => {
            const model = state.models.find((m) => m.id === r.model);
            const m = r.metrics;
            return h('div', { class: 'run-result', dataset: { model: r.model } },
              h('p', { class: 'name' }, model?.name ?? r.model, run.vote?.winner === r.model ? h('span', { class: 'won' }, ' · ganador') : null),
              r.status === 'done'
                ? [
                    h('audio', { controls: true, preload: 'none', src: r.audioUrl }),
                    h('p', { class: 'small-metrics' }, `${m.audio_seconds} s de audio en ${m.gen_seconds} s (RTF ${m.rtf}), ${m.peak_memory_gb} GB, carga ${m.load_seconds} s`),
                    h('a', { class: 'link', href: r.audioUrl, download: `${run.id}_${r.model}.wav` }, 'Descargar WAV'),
                  ]
                : h('p', { class: r.status === 'error' ? 'error' : 'hint' }, r.status === 'error' ? r.message : STATUS_TEXT[r.status]));
          })));
    }),
  );
}

function reuseRun(run) {
  textEl.value = run.text;
  textEl.dispatchEvent(new Event('input'));
  for (const r of Object.values(run.results)) {
    const model = state.models.find((m) => m.id === r.model);
    if (!model) continue;
    const s = modelSettings(model);
    s.params = { ...model.defaults, ...r.params };
    s.useReference = r.useReference;
  }
  for (const m of state.models) modelSettings(m).enabled = m.ready && Boolean(run.results[m.id]);
  if (run.voice && state.voices.some((v) => v.id === run.voice.id)) state.settings.voiceId = run.voice.id;
  $('#blind').checked = state.settings.blind = run.blind;
  saveSettings();
  renderVoiceSelect();
  renderStrips();
  showTab('arena');
}

async function deleteRun(id) {
  await api(`/api/runs/${id}`, { method: 'DELETE' }).catch((e) => showError(e.message));
  state.runs.delete(id);
  if (state.currentRunId === id) state.currentRunId = null;
  renderHistory();
  renderCurrentRun();
}

// ---------- Ranking ----------

async function renderRanking() {
  const rows = await api('/api/leaderboard');
  const container = $('#ranking');
  if (!rows.some((r) => r.battles)) {
    container.replaceChildren(h('p', { class: 'empty' }, 'Aún no hay votos. Genera con dos o más modelos, activa la escucha a ciegas y vota por el que suene más humano.'));
    return;
  }
  container.replaceChildren(
    h('table', {},
      h('thead', {}, h('tr', {}, h('th', {}, 'Modelo'), h('th', { class: 'num' }, 'Victorias'), h('th', { class: 'num' }, 'Comparaciones'), h('th', { class: 'num' }, 'A ciegas'), h('th', { class: 'num' }, 'RTF medio'))),
      h('tbody', {},
        ...rows.map((r) =>
          h('tr', { dataset: { model: r.id } },
            h('td', {}, h('strong', {}, r.name), h('div', { class: 'bar' }, h('span', { style: `width:${Math.round((r.winRate ?? 0) * 100)}%` }))),
            h('td', { class: 'num' }, r.battles ? `${r.wins} (${Math.round(r.winRate * 100)} %)` : '—'),
            h('td', { class: 'num' }, r.battles),
            h('td', { class: 'num' }, r.blindWins),
            h('td', { class: 'num' }, r.avgRtf ? r.avgRtf.toFixed(2) : '—'))))),
  );
}

// ---------- Voces ----------

let pendingAudio = null; // { base64, mime }
let recorder = null;

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function setPendingAudio(blob, label) {
  pendingAudio = { base64: await blobToBase64(blob), mime: blob.type || 'audio/wav' };
  const preview = $('#vf-preview');
  preview.src = URL.createObjectURL(blob);
  preview.hidden = false;
  $('#vf-audio-status').textContent = label;
}

$('#vf-file').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (file) setPendingAudio(file, file.name);
});

$('#vf-record').addEventListener('click', async () => {
  const btn = $('#vf-record');
  if (recorder) {
    recorder.stop();
    return;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const chunks = [];
    recorder = new MediaRecorder(stream);
    recorder.ondataavailable = (e) => chunks.push(e.data);
    recorder.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      recorder = null;
      btn.textContent = 'Grabar';
      btn.classList.remove('recording');
      setPendingAudio(new Blob(chunks, { type: chunks[0]?.type || 'audio/webm' }), 'Grabación lista');
    };
    recorder.start();
    btn.textContent = 'Detener grabación';
    btn.classList.add('recording');
    $('#vf-audio-status').textContent = 'Grabando… habla con naturalidad durante 5 a 15 segundos';
  } catch {
    $('#vf-audio-status').textContent = 'No hay acceso al micrófono. Revisa los permisos del navegador.';
  }
});

$('#voice-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!pendingAudio) {
    $('#vf-audio-status').textContent = 'Elige un archivo o graba un audio primero.';
    return;
  }
  const submit = $('#vf-submit');
  submit.disabled = true;
  submit.textContent = 'Guardando…';
  try {
    const transcript = $('#vf-transcript').value.trim();
    const voice = await api('/api/voices', {
      method: 'POST',
      body: { name: $('#vf-name').value, audioBase64: pendingAudio.base64, mime: pendingAudio.mime, transcript },
    });
    if (!transcript) {
      submit.textContent = 'Transcribiendo…';
      await api(`/api/voices/${voice.id}/transcribe`, { method: 'POST' }).catch(() => null);
    }
    e.target.reset();
    pendingAudio = null;
    $('#vf-preview').hidden = true;
    $('#vf-audio-status').textContent = 'Sin audio';
    state.settings.voiceId = voice.id;
    saveSettings();
    await loadVoices();
  } catch (err) {
    $('#vf-audio-status').textContent = err.message;
  } finally {
    submit.disabled = false;
    submit.textContent = 'Guardar voz';
  }
});

function renderVoices() {
  const container = $('#voices-list');
  if (!state.voices.length) {
    container.replaceChildren(h('p', { class: 'empty' }, 'No hay voces. Sube o graba una arriba, o ejecuta npm run download para obtener la voz de demostración.'));
    return;
  }
  container.replaceChildren(
    ...state.voices.map((v) => {
      const transcript = h('textarea', { rows: 2, value: v.transcript ?? '', disabled: v.builtin, placeholder: 'Sin transcripción' });
      const status = h('span', { class: 'hint' });
      return h('div', { class: 'voice-item' },
        h('div', {}, h('p', { class: 'name' }, v.name), h('p', { class: 'hint' }, v.builtin ? 'Incluida' : `${v.duration ? `${v.duration.toFixed(1)} s` : ''}`), h('audio', { controls: true, preload: 'none', src: `/api/voices/${v.id}/audio` })),
        transcript,
        h('div', { class: 'actions' },
          v.builtin
            ? null
            : [
                h('button', { class: 'btn ghost small', onclick: async () => { await api(`/api/voices/${v.id}`, { method: 'PATCH', body: { transcript: transcript.value } }); status.textContent = 'Guardada'; await loadVoices(false); } }, 'Guardar transcripción'),
                h('button', {
                  class: 'link',
                  onclick: async () => {
                    status.textContent = 'Transcribiendo con Whisper…';
                    try {
                      const r = await api(`/api/voices/${v.id}/transcribe`, { method: 'POST' });
                      transcript.value = r.transcript;
                      status.textContent = 'Transcrita';
                      await loadVoices(false);
                    } catch (err) {
                      status.textContent = err.message;
                    }
                  },
                }, 'Transcribir con Whisper'),
                h('button', { class: 'link danger', onclick: async () => { await api(`/api/voices/${v.id}`, { method: 'DELETE' }); await loadVoices(); } }, 'Eliminar'),
              ],
          status));
    }),
  );
}

async function loadVoices(rerenderList = true) {
  state.voices = await api('/api/voices');
  renderVoiceSelect();
  if (rerenderList && !$('#view-voices').hidden) renderVoices();
}

// ---------- Eventos en vivo ----------

function connectEvents() {
  const es = new EventSource('/api/events');
  es.addEventListener('queue', (e) => {
    renderChain(JSON.parse(e.data));
  });
  es.addEventListener('run', (e) => {
    const run = JSON.parse(e.data);
    state.runs.set(run.id, run);
    if (run.id === state.currentRunId) renderCurrentRun();
    if (!$('#view-history').hidden) renderHistory();
  });
  es.addEventListener('run-deleted', (e) => {
    state.runs.delete(JSON.parse(e.data).id);
    if (!$('#view-history').hidden) renderHistory();
  });
}

// ---------- Inicio ----------

async function init() {
  const [models, runs] = await Promise.all([api('/api/models'), api('/api/runs')]);
  state.models = models;
  for (const r of runs) state.runs.set(r.id, r);
  // Retoma la corrida más reciente si sigue en curso.
  const active = runs.find((r) => Object.values(r.results).some((x) => ACTIVE.has(x.status)));
  state.currentRunId = active?.id ?? runs[0]?.id ?? null;
  await loadVoices();
  renderStrips();
  connectEvents();
}

init().catch((err) => showError(`No se pudo conectar con el servidor: ${err.message}`));

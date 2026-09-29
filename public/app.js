import { SAMPLES } from './samples.js';

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

const OFFLINE_MSG = 'No hay conexión con el servidor. Arráncalo con «npm run dev» en la carpeta del proyecto; la página se reconecta sola.';

async function api(path, options = {}) {
  let res;
  try {
    res = await fetch(path, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...options.headers },
      body: options.body && typeof options.body !== 'string' ? JSON.stringify(options.body) : options.body,
    });
  } catch {
    // fetch solo rechaza por fallos de red: el servidor no está corriendo o se reinició.
    throw new Error(OFFLINE_MSG);
  }
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

const state = {
  models: [],
  voices: [],
  presets: [],
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
let textTimer = null;
textEl.addEventListener('input', () => {
  state.settings.text = textEl.value;
  saveSettings();
  updateCounter();
  updateGenerateButton();
  // Las tomas de cada columna dependen del texto: se comparan versiones del mismo guion.
  clearTimeout(textTimer);
  textTimer = setTimeout(renderOutputs, 250);
});
updateCounter();

// El acceso rápido también fija el tono global del guion en cada modelo que lo admite
// (instrucción de Fish, entrega y ritmo de Higgs, instrucción de CosyVoice3).
function applySample({ text, styles }) {
  textEl.value = text;
  textEl.dispatchEvent(new Event('input'));
  for (const [modelId, params] of Object.entries(styles)) {
    const model = state.models.find((m) => m.id === modelId);
    if (model) Object.assign(modelSettings(model).params, params);
  }
  saveSettings();
  renderStrips();
}

const styleSummary = ({ styles }) =>
  [
    styles.fish && `Fish: ${styles.fish.instruct}`,
    styles.higgs && `Higgs: entrega ${styles.higgs.delivery}, ritmo ${styles.higgs.pace}`,
    styles.cosyvoice && `CosyVoice3: ${styles.cosyvoice.instruct}`,
  ].filter(Boolean).join('\n');

$('#samples').append(
  ...SAMPLES.map((sample) =>
    h('button', { class: 'chip', type: 'button', title: styleSummary(sample), onclick: () => applySample(sample) }, sample.label),
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
      : 'Sin transcripción: Qwen usará solo el timbre, CosyVoice3 irá en modo cross-lingual y Fish e Higgs clonarán con menos precisión.'
    : 'Chatterbox usará su voz integrada; Qwen, Fish e Higgs generarán una voz aleatoria; CosyVoice3 clonará la voz demo es-MX.';
}
$('#voice').addEventListener('change', (e) => {
  state.settings.voiceId = e.target.value;
  saveSettings();
  updateVoicePreview();
  refreshAllPending();
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
    refreshPending(model.id);
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

// Rellena los controles de cada columna; se guarda por modelo para refrescarlos sin
// reconstruir la columna (y sin cortar el audio que esté sonando en sus tomas).
const stripFillers = new Map();

function applyConfig(model, params, useReference) {
  const settings = modelSettings(model);
  settings.params = { ...model.defaults, ...params };
  settings.useReference = useReference;
  saveSettings();
  stripFillers.get(model.id)?.();
}

function renderStrips() {
  const container = $('#strips');
  container.replaceChildren();
  stripFillers.clear();
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
    useRef.addEventListener('change', () => {
      settings.useReference = useRef.checked;
      saveSettings();
      refreshPending(model.id);
    });

    const fill = () => {
      const s = modelSettings(model);
      useRef.checked = s.useReference;
      $('.params', strip).replaceChildren(...model.params.filter((p) => !p.advanced).map((p) => renderParam(model, p, s)));
      $('.params-adv', strip).replaceChildren(...model.params.filter((p) => p.advanced).map((p) => renderParam(model, p, s)));
      refreshPending(model.id);
    };
    stripFillers.set(model.id, fill);
    $('.reset', strip).addEventListener('click', () => applyConfig(model, model.defaults, true));

    setupPresets(strip, model);
    $('.solo', strip).addEventListener('click', () => generateSolo(model));
    container.append(strip);
    fill();
  }
  updateGenerateButton();
  renderOutputs();
}

// ---------- Ajustes guardados ----------

function setupPresets(strip, model) {
  const settings = modelSettings(model);
  const select = $('.preset-select', strip);
  const status = $('.preset-status', strip);
  const nameInput = $('.preset-name', strip);

  select.addEventListener('change', () => {
    const preset = state.presets.find((p) => p.id === select.value);
    settings.presetId = preset?.id ?? null;
    $('.preset-delete', strip).hidden = !preset;
    if (!preset) return saveSettings();
    applyConfig(model, preset.params, preset.useReference);
    // Guardar con el mismo nombre sobrescribe: así se afina un ajuste existente.
    nameInput.value = preset.name;
    status.textContent = `Ajuste «${preset.name}» cargado.`;
  });

  $('.preset-delete', strip).addEventListener('click', async () => {
    const preset = state.presets.find((p) => p.id === select.value);
    if (!preset) return;
    try {
      await api(`/api/presets/${preset.id}`, { method: 'DELETE' });
      state.presets = state.presets.filter((p) => p.id !== preset.id);
      settings.presetId = null;
      saveSettings();
      renderPresetSelects();
      status.textContent = `Ajuste «${preset.name}» eliminado.`;
    } catch (err) {
      status.textContent = err.message;
    }
  });

  $('.preset-save', strip).addEventListener('submit', async (e) => {
    e.preventDefault();
    const s = modelSettings(model);
    status.textContent = await savePreset(model, nameInput.value, s.params, s.useReference);
  });
}

async function savePreset(model, name, params, useReference) {
  if (!name.trim()) return 'Escribe un nombre para el ajuste.';
  const replaces = state.presets.some((p) => p.model === model.id && p.name.toLowerCase() === name.trim().toLowerCase());
  try {
    const preset = await api('/api/presets', { method: 'POST', body: { model: model.id, name, params, useReference } });
    state.presets = [...state.presets.filter((p) => p.id !== preset.id), preset];
    modelSettings(model).presetId = preset.id;
    saveSettings();
    renderPresetSelects();
    return replaces ? `Ajuste «${preset.name}» actualizado.` : `Ajuste «${preset.name}» guardado.`;
  } catch (err) {
    return err.message;
  }
}

function renderPresetSelects() {
  for (const strip of $$('.strip')) {
    const model = state.models.find((m) => m.id === strip.dataset.model);
    const settings = modelSettings(model);
    const presets = state.presets.filter((p) => p.model === model.id).sort((a, b) => a.name.localeCompare(b.name, 'es'));
    const select = $('.preset-select', strip);
    select.replaceChildren(
      h('option', { value: '' }, presets.length ? 'Elegir un ajuste…' : 'Aún no hay ajustes guardados'),
      ...presets.map((p) => h('option', { value: p.id }, p.name)),
    );
    select.disabled = !presets.length;
    select.value = presets.some((p) => p.id === settings.presetId) ? settings.presetId : '';
    $('.preset-delete', strip).hidden = !select.value;
  }
}

function enabledModels() {
  return state.models.filter((m) => m.ready && modelSettings(m).enabled);
}

const runActive = (run) => Object.values(run.results).some((r) => ACTIVE.has(r.status));

function isBusy() {
  const run = state.runs.get(state.currentRunId);
  return Boolean(run && runActive(run));
}

function updateGenerateButton() {
  const n = enabledModels().length;
  const btn = $('#generate');
  btn.textContent = n === 1 ? 'Generar con 1 modelo' : `Generar con ${n} modelos`;
  btn.disabled = n === 0 || !textEl.value.trim() || isBusy();
  $('#cancel').hidden = ![...state.runs.values()].some(runActive);
  for (const solo of $$('.solo')) {
    const model = state.models.find((m) => m.id === solo.closest('.strip').dataset.model);
    solo.disabled = !model?.ready || !textEl.value.trim();
  }
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
        mode: 'arena',
        models: enabledModels().map((m) => {
          const s = modelSettings(m);
          return { id: m.id, params: s.params, useReference: s.useReference };
        }),
      },
    });
    state.runs.set(run.id, run);
    state.currentRunId = run.id;
    renderOutputs();
  } catch (err) {
    showError(err.message);
  }
});

// Toma individual: solo este modelo con sus ajustes actuales. Las tomas anteriores se
// conservan en la columna para compararlas; se pueden encolar varias seguidas.
async function generateSolo(model) {
  showError(null);
  const s = modelSettings(model);
  try {
    const run = await api('/api/runs', {
      method: 'POST',
      body: {
        text: textEl.value,
        voiceId: $('#voice').value || null,
        mode: 'single',
        models: [{ id: model.id, params: s.params, useReference: s.useReference }],
      },
    });
    state.runs.set(run.id, run);
    renderOutputs();
  } catch (err) {
    showError(err.message);
  }
}

$('#cancel').addEventListener('click', async () => {
  const active = [...state.runs.values()].filter(runActive);
  await Promise.all(active.map((run) => api(`/api/runs/${run.id}/cancel`, { method: 'POST' }))).catch((e) => showError(e.message));
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

// ---------- Tomas: todas las generaciones de un modelo para el texto actual ----------

function takesFor(modelId) {
  const text = textEl.value.trim();
  return [...state.runs.values()]
    .filter((run) => run.results[modelId] && run.text === text)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map((run, i) => ({ run, result: run.results[modelId], n: i + 1 }));
}

const clip = (text, max = 48) => (text.length > max ? `${text.slice(0, max)}…` : text);

function paramText(param, value) {
  if (param.type === 'checkbox') return value ? 'sí' : 'no';
  if (param.type === 'textarea') return value ? `“${clip(value)}”` : '(vacía)';
  return String(formatValue(param, value));
}

// Vista comparable de una configuración: etiqueta y texto de cada parámetro, más la voz.
function configView(model, params, seedText, voice) {
  const view = {};
  for (const p of model.params) view[p.key] = { label: p.label, text: p.key === 'seed' ? seedText : paramText(p, params[p.key] ?? p.default) };
  view.voice = { label: 'Voz', text: voice ?? 'sin referencia' };
  return view;
}

const takeSeed = (result) => result.seedUsed ?? result.params.seed;

function takeView(model, { run, result }) {
  const seed = takeSeed(result);
  return configView(model, result.params, seed ? String(seed) : 'aleatoria', result.useReference ? run.voice?.name : null);
}

function pendingView(model, latest) {
  const s = modelSettings(model);
  const voice = state.voices.find((v) => v.id === $('#voice').value);
  // Semilla aleatoria contra una toma también aleatoria no es un cambio.
  const seedText = s.params.seed ? String(s.params.seed) : latest && !latest.result.params.seed ? String(takeSeed(latest.result)) : 'aleatoria';
  return configView(model, s.params, seedText, s.useReference && voice ? voice.name : null);
}

function diffViews(a, b) {
  return Object.keys(b)
    .filter((k) => a[k]?.text !== b[k].text)
    .map((k) => h('li', {}, h('span', { class: 'diff-key' }, b[k].label), ' ', h('s', {}, a[k]?.text ?? '—'), ' → ', h('strong', {}, b[k].text)));
}

function refreshPending(modelId) {
  const strip = $(`.strip[data-model="${modelId}"]`);
  const model = state.models.find((m) => m.id === modelId);
  if (!strip || !model) return;
  const takes = takesFor(modelId);
  const latest = takes.at(-1);
  const el = $('.pending-diff', strip);
  if (!latest) {
    el.replaceChildren('Genera una toma con estos ajustes; las siguientes se comparan con ella.');
    return;
  }
  const changes = diffViews(takeView(model, latest), pendingView(model, latest));
  el.replaceChildren(
    ...[changes.length
      ? [h('span', {}, `Próxima toma frente a la toma ${latest.n}:`), h('ul', { class: 'diff' }, changes)]
      : modelSettings(model).params.seed
        ? `Mismos ajustes que la toma ${latest.n}: con semilla fija saldrá casi igual.`
        : `Mismos ajustes que la toma ${latest.n}: cambiará solo la semilla aleatoria.`].flat(),
  );
}

function refreshAllPending() {
  for (const m of state.models) refreshPending(m.id);
}

function createTakeEl(model) {
  const el = h('article', { class: 'take' },
    h('header', { class: 'take-head' },
      h('span', { class: 'status-dot' }),
      h('strong', { class: 'take-title' }),
      h('span', { class: 'take-tag' }),
      h('span', { class: 'take-time' })),
    h('p', { class: 'status-text' }),
    h('audio', { controls: true, preload: 'none', hidden: true }),
    h('dl', { class: 'metrics' }),
    h('div', { class: 'take-diff' }),
    h('details', { class: 'take-config' }, h('summary', {}, 'Configuración completa'), h('dl', {})),
    h('div', { class: 'take-actions' },
      h('button', { class: 'link', type: 'button', onclick: () => loadTake(model, el._take) }, 'Usar estos ajustes'),
      h('button', { class: 'link', type: 'button', onclick: () => toggleTakeSave(el) }, 'Guardar como ajuste'),
      h('button', { class: 'link danger', type: 'button', onclick: () => discardTake(el._take) }, 'Descartar')),
    h('form', {
      class: 'take-save',
      hidden: true,
      onsubmit: async (e) => {
        e.preventDefault();
        const { result } = el._take;
        const status = $('.take-save-status', el);
        status.textContent = await savePreset(model, $('input', e.target).value, { ...result.params, seed: takeSeed(result) }, result.useReference);
      },
    },
      h('input', { maxlength: 80, placeholder: 'Nombre del ajuste' }),
      h('button', { class: 'btn ghost small', type: 'submit' }, 'Guardar'),
      h('p', { class: 'hint take-save-status', 'aria-live': 'polite' })),
    h('details', { class: 'log', hidden: true }, h('summary', {}, 'Registro'), h('pre', {})));
  return el;
}

function updateTakeEl(el, model, take, prev, total) {
  const { run, result, n } = take;
  el._take = take;
  el.dataset.status = result.status;
  el.classList.toggle('latest', n === total && total > 1);
  const hidden = run.blind && !run.vote;
  $('.take-title', el).textContent = `Toma ${n}`;
  $('.take-tag', el).textContent = run.mode === 'single' ? 'individual' : run.blind ? 'arena · a ciegas' : 'arena';
  $('.take-time', el).textContent = new Date(run.createdAt).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
  $('.status-text', el).textContent =
    hidden && result.status === 'done'
      ? 'Lista: escúchala abajo, a ciegas'
      : result.status === 'error'
        ? result.message
        : result.message && ACTIVE.has(result.status) ? result.message : result.status === 'done' ? '' : STATUS_TEXT[result.status];

  const audio = $('audio', el);
  const showAudio = result.status === 'done' && !hidden;
  audio.hidden = !showAudio;
  if (showAudio && audio.dataset.src !== result.audioUrl) {
    audio.dataset.src = result.audioUrl;
    audio.src = result.audioUrl;
  }
  $('.metrics', el).replaceChildren(...(showAudio ? metricList(result.metrics) : []));

  const view = takeView(model, take);
  const diffEl = $('.take-diff', el);
  if (hidden) diffEl.replaceChildren();
  else if (!prev) diffEl.replaceChildren(h('p', { class: 'hint' }, `Primera toma de este texto · semilla ${view.seed.text}`));
  else {
    const changes = diffViews(takeView(model, prev), view);
    diffEl.replaceChildren(
      ...(changes.length
        ? [h('p', { class: 'hint' }, `Cambios frente a la toma ${prev.n}:`), h('ul', { class: 'diff' }, changes)]
        : [h('p', { class: 'hint' }, `Mismos ajustes que la toma ${prev.n}.`)]),
    );
  }
  $('.take-config dl', el).replaceChildren(...Object.values(view).map((v) => h('div', {}, h('dt', {}, v.label), h('dd', {}, v.text))));
  $('.take-config', el).hidden = hidden;
  $('.take-actions', el).hidden = hidden || ACTIVE.has(result.status);

  const log = $('.log', el);
  log.hidden = !(result.status === 'error' && result.log?.length);
  if (!log.hidden) $('pre', log).textContent = result.log.join('\n');
}

function renderTakes(strip, model) {
  const takes = takesFor(model.id);
  const list = $('.takes', strip);
  $('.takes-empty', strip).hidden = takes.length > 0;
  // Reconciliación por clave para no recrear (ni cortar) los audios que ya existen.
  const existing = new Map([...list.children].map((el) => [el.dataset.key, el]));
  const ordered = [...takes].reverse().map((take) => {
    const key = `${take.run.id}:${model.id}`;
    let el = existing.get(key);
    if (el) existing.delete(key);
    else {
      el = createTakeEl(model);
      el.dataset.key = key;
    }
    updateTakeEl(el, model, take, takes[take.n - 2], takes.length);
    return el;
  });
  for (const el of existing.values()) el.remove();
  ordered.forEach((el, i) => {
    if (list.children[i] !== el) list.insertBefore(el, list.children[i] ?? null);
  });
  refreshPending(model.id);
}

function renderOutputs() {
  for (const strip of $$('.strip')) {
    const model = state.models.find((m) => m.id === strip.dataset.model);
    if (model) renderTakes(strip, model);
  }
  renderBlindPanel(state.runs.get(state.currentRunId));
  updateGenerateButton();
}

function loadTake(model, { result, n }) {
  applyConfig(model, { ...result.params, seed: takeSeed(result) }, result.useReference);
  const strip = $(`.strip[data-model="${model.id}"]`);
  $('.preset-status', strip).textContent = `Ajustes de la toma ${n} cargados (con su semilla, para reproducirla).`;
}

function toggleTakeSave(el) {
  const form = $('.take-save', el);
  form.hidden = !form.hidden;
  if (form.hidden) return;
  const input = $('input', form);
  if (!input.value) input.value = `Toma ${el._take.n} · ${new Date(el._take.run.createdAt).toLocaleString('es', { dateStyle: 'short', timeStyle: 'short' })}`;
  input.select();
}

async function discardTake({ run, result }) {
  try {
    const updated = await api(`/api/runs/${run.id}/results/${result.model}`, { method: 'DELETE' });
    if (updated.id) state.runs.set(updated.id, updated);
    else {
      state.runs.delete(run.id);
      if (state.currentRunId === run.id) state.currentRunId = null;
    }
    renderOutputs();
    if (!$('#view-history').hidden) renderHistory();
  } catch (err) {
    showError(err.message);
  }
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
    renderOutputs();
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
      const info = [date, run.voice ? `voz: ${run.voice.name}` : 'sin voz de referencia', run.mode === 'single' ? 'toma individual' : null, run.blind ? 'a ciegas' : null, run.vote ? (run.vote.winner === 'tie' ? 'votado: empate' : 'votado') : null].filter(Boolean).join(', ');
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
                    h('p', { class: 'small-metrics' }, `${m.audio_seconds} s de audio en ${m.gen_seconds} s (RTF ${m.rtf}), ${m.peak_memory_gb} GB, carga ${m.load_seconds} s${r.seedUsed ? `, semilla ${r.seedUsed}` : ''}`),
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
    // Con la semilla realmente usada para poder reproducir el resultado.
    s.params = { ...model.defaults, ...r.params, seed: takeSeed(r) };
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
  renderOutputs();
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
  let lost = false;
  es.addEventListener('error', () => {
    lost = true;
    showError(OFFLINE_MSG);
  });
  es.addEventListener('open', async () => {
    if (!lost) return;
    lost = false;
    // Reconectado: resincroniza lo que cambió mientras el servidor no estaba.
    try {
      for (const r of await api('/api/runs')) state.runs.set(r.id, r);
      state.presets = await api('/api/presets');
      renderPresetSelects();
      if ($('#error').textContent === OFFLINE_MSG) showError(null);
      renderOutputs();
      updateGenerateButton();
    } catch {}
  });
  es.addEventListener('queue', (e) => {
    renderChain(JSON.parse(e.data));
  });
  es.addEventListener('run', (e) => {
    const run = JSON.parse(e.data);
    state.runs.set(run.id, run);
    renderOutputs();
    if (!$('#view-history').hidden) renderHistory();
  });
  es.addEventListener('run-deleted', (e) => {
    state.runs.delete(JSON.parse(e.data).id);
    renderOutputs();
    if (!$('#view-history').hidden) renderHistory();
  });
  es.addEventListener('presets', (e) => {
    state.presets = JSON.parse(e.data);
    renderPresetSelects();
  });
}

// ---------- Inicio ----------

async function init() {
  const [models, runs, presets] = await Promise.all([api('/api/models'), api('/api/runs'), api('/api/presets')]);
  state.models = models;
  state.presets = presets;
  for (const r of runs) state.runs.set(r.id, r);
  // Retoma la corrida de arena más reciente (la que alimenta la escucha a ciegas).
  const arena = runs.filter((r) => r.mode !== 'single');
  state.currentRunId = (arena.find(runActive) ?? arena[0])?.id ?? null;
  await loadVoices();
  renderStrips();
  renderPresetSelects();
  connectEvents();
}

init().catch((err) => {
  showError(err.message === OFFLINE_MSG ? OFFLINE_MSG : `No se pudo iniciar la interfaz: ${err.message}`);
  // Reintenta hasta que el servidor responda.
  setTimeout(() => location.reload(), 3000);
});

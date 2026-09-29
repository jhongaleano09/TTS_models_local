import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { BUILTIN_VOICES_DIR, DATA_DIR, OUTPUTS_DIR, VOICES_DIR } from './paths.js';

mkdirSync(OUTPUTS_DIR, { recursive: true });
mkdirSync(VOICES_DIR, { recursive: true });

const readJson = (file, fallback) => {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
};
const writeJson = (file, data) => writeFileSync(file, JSON.stringify(data, null, 2));

// ---------- Corridas ----------

export const runDir = (id) => join(OUTPUTS_DIR, id);

export function saveRun(run) {
  mkdirSync(runDir(run.id), { recursive: true });
  writeJson(join(runDir(run.id), 'run.json'), run);
}

export function loadRuns() {
  return readdirSync(OUTPUTS_DIR)
    .map((id) => readJson(join(OUTPUTS_DIR, id, 'run.json'), null))
    .filter(Boolean)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function deleteRun(id) {
  rmSync(runDir(id), { recursive: true, force: true });
}

// ---------- Voces de referencia ----------

const VOICES_FILE = join(DATA_DIR, 'voices.json');

// Voz de demostración del Space oficial de Chatterbox es-MX (descargada por npm run download).
const BUILTIN_VOICES = [
  {
    id: 'es_mx_f1',
    name: 'Mujer es-MX (demo Resemble)',
    file: join(BUILTIN_VOICES_DIR, 'es_mx_f1.wav'),
    transcript:
      'Yo lo respeto todo. Pienso que los fundamentos más grandes de una religión siempre se basan en el amor a ti mismo y al prójimo.',
    builtin: true,
  },
];

export function listVoices() {
  const custom = readJson(VOICES_FILE, []);
  return [...BUILTIN_VOICES.filter((v) => existsSync(v.file)), ...custom];
}

export const getVoice = (id) => listVoices().find((v) => v.id === id);

export function saveVoice(voice) {
  const custom = readJson(VOICES_FILE, []).filter((v) => v.id !== voice.id);
  custom.push(voice);
  writeJson(VOICES_FILE, custom);
  return voice;
}

export function deleteVoice(id) {
  const custom = readJson(VOICES_FILE, []);
  const voice = custom.find((v) => v.id === id);
  if (!voice) return false;
  rmSync(voice.file, { force: true });
  writeJson(VOICES_FILE, custom.filter((v) => v.id !== id));
  return true;
}

// ---------- Ajustes guardados (presets por modelo) ----------

const PRESETS_FILE = join(DATA_DIR, 'presets.json');

export const listPresets = () => readJson(PRESETS_FILE, []);

// Guardar con un nombre que ya existe para ese modelo lo sobrescribe.
export function savePreset({ model, name, params, useReference }) {
  const presets = listPresets();
  const existing = presets.find((p) => p.model === model && p.name.toLowerCase() === name.toLowerCase());
  const now = new Date().toISOString();
  const preset = existing
    ? Object.assign(existing, { name, params, useReference, updatedAt: now })
    : { id: `p_${randomUUID().slice(0, 8)}`, model, name, params, useReference, createdAt: now, updatedAt: now };
  if (!existing) presets.push(preset);
  writeJson(PRESETS_FILE, presets);
  return preset;
}

export function deletePreset(id) {
  const presets = listPresets();
  if (!presets.some((p) => p.id === id)) return false;
  writeJson(PRESETS_FILE, presets.filter((p) => p.id !== id));
  return true;
}

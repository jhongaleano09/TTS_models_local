import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const WORKERS_DIR = join(ROOT, 'workers');
export const OUTPUTS_DIR = join(ROOT, 'outputs', 'runs');
export const DATA_DIR = join(ROOT, 'data');
export const TMP_DIR = join(ROOT, 'outputs', 'tmp');
export const VOICES_DIR = join(DATA_DIR, 'voices');
export const BUILTIN_VOICES_DIR = join(ROOT, 'assets', 'voices');
export const PUBLIC_DIR = join(ROOT, 'public');

export const pythonFor = (env) => join(ROOT, '.venvs', env, 'bin', 'python');

// Archivos que confirman que cada modelo está listo para usarse.
export function modelReadiness(model) {
  if (!existsSync(pythonFor(model.env))) {
    return { ready: false, reason: `Falta el entorno Python .venvs/${model.env}. Ejecuta: npm run setup` };
  }
  if (model.id === 'fish' && !existsSync(join(ROOT, 'models', 'fish-s2-pro-4bit', 'codec.safetensors'))) {
    return { ready: false, reason: 'Fish S2 Pro 4-bit no está ensamblado. Ejecuta: npm run download -- fish' };
  }
  return { ready: true };
}

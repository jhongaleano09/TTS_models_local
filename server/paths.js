import { existsSync, readFileSync, statSync } from 'node:fs';
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
  if (model.id === 'supertonic') {
    const dir = join(ROOT, 'models', 'supertonic-3');
    const files = ['onnx/tts.json', 'onnx/unicode_indexer.json', 'onnx/duration_predictor.onnx', 'onnx/text_encoder.onnx', 'onnx/vector_estimator.onnx', 'onnx/vocoder.onnx', ...['M1', 'M2', 'M3', 'M4', 'M5', 'F1', 'F2', 'F3', 'F4', 'F5'].map((voice) => `voice_styles/${voice}.json`)];
    try {
      const manifest = JSON.parse(readFileSync(join(dir, 'download-manifest.json'), 'utf8'));
      if (manifest.repo !== model.repo || manifest.revision !== model.revision || files.some((file) => !statSync(join(dir, file)).isFile() || statSync(join(dir, file)).size === 0)) throw new Error('Pesos incompletos');
    } catch {
      return { ready: false, reason: 'Faltan pesos o la revisión fijada de Supertonic 3. Ejecuta: npm run download -- supertonic' };
    }
  }
  return { ready: true };
}

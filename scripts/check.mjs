// Verifica que el entorno esté listo: node scripts/check.mjs (npm run check)
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { MODELS } from '../server/models.js';
import { modelReadiness, pythonFor } from '../server/paths.js';

let ok = true;
const line = (good, msg) => {
  ok &&= good;
  console.log(`${good ? '✓' : '✗'} ${msg}`);
};

for (const bin of ['ffmpeg', 'ffprobe']) {
  let found = true;
  try {
    execFileSync(bin, ['-version'], { stdio: 'ignore' });
  } catch {
    found = false;
  }
  line(found, `${bin} disponible`);
}
for (const env of new Set(MODELS.map((m) => m.env))) line(existsSync(pythonFor(env)), `Entorno Python .venvs/${env}`);
for (const m of MODELS) {
  const r = modelReadiness(m);
  line(r.ready, `${m.name}${r.ready ? '' : ` — ${r.reason}`}`);
}
if (existsSync(pythonFor('torch'))) {
  const mps = execFileSync(pythonFor('torch'), ['-c', 'import torch;print(torch.backends.mps.is_available())']).toString().trim();
  line(mps === 'True', 'PyTorch con aceleración MPS');
}
if (existsSync(pythonFor('mlx'))) {
  try {
    const info = execFileSync(pythonFor('mlx'), ['-c', 'from importlib.metadata import version; from mlx_audio.tts.models.voxcpm2 import Model; print(version("mlx-audio"))']).toString().trim();
    line(info === '0.5.7', `VoxCPM2: runtime MLX ${info} con clonación`);
  } catch {
    line(false, 'Falta el runtime de VoxCPM2. Ejecuta: npm run setup');
  }
}
if (existsSync(pythonFor('supertonic'))) {
  try {
    const info = execFileSync(pythonFor('supertonic'), ['-c', 'from importlib.metadata import version; import supertonic, onnxruntime, soundfile; print(version("supertonic")); print(version("onnxruntime")); print(",".join(onnxruntime.get_available_providers()))']).toString().trim().split('\n');
    line(info[0] === '1.3.1' && info[1] === '1.24.4' && info[2]?.includes('CPUExecutionProvider'), `Supertonic SDK ${info[0]} · ONNX ${info[1]} · ${info[2]}`);
  } catch {
    line(false, 'Faltan dependencias de Supertonic. Ejecuta: npm run setup');
  }
}
process.exit(ok ? 0 : 1);

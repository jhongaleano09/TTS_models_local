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
for (const env of ['torch', 'mlx']) line(existsSync(pythonFor(env)), `Entorno Python .venvs/${env}`);
for (const m of MODELS) {
  const r = modelReadiness(m);
  line(r.ready, `${m.name}${r.ready ? '' : ` — ${r.reason}`}`);
}
if (existsSync(pythonFor('torch'))) {
  const mps = execFileSync(pythonFor('torch'), ['-c', 'import torch;print(torch.backends.mps.is_available())']).toString().trim();
  line(mps === 'True', 'PyTorch con aceleración MPS');
}
process.exit(ok ? 0 : 1);

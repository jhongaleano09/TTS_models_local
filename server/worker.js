import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { WORKERS_DIR, pythonFor } from './paths.js';

const EVENT_PREFIX = '@@EVENT ';

/**
 * Lanza un worker Python y resuelve con el evento `done`.
 * `onEvent` recibe los eventos de estado; `onLog` las líneas de log.
 * Devuelve { promise, kill } para poder cancelar.
 */
export function runWorker({ env, script, job, jobPath, onEvent = () => {}, onLog = () => {} }) {
  writeFileSync(jobPath, JSON.stringify(job, null, 2));
  const child = spawn(pythonFor(env), [join(WORKERS_DIR, script), jobPath], {
    cwd: WORKERS_DIR,
    env: { ...process.env, PYTHONUNBUFFERED: '1', TOKENIZERS_PARALLELISM: 'false', TQDM_DISABLE: '1' },
  });

  let done = null;
  let error = null;
  let killed = false;

  const handleLines = (stream) => {
    let buffer = '';
    stream.on('data', (chunk) => {
      buffer += chunk.toString();
      // tqdm usa \r para redibujar; lo tratamos como salto de línea.
      const lines = buffer.split(/\r?\n|\r/);
      buffer = lines.pop();
      for (const line of lines) {
        if (!line.trim()) continue;
        if (line.startsWith(EVENT_PREFIX)) {
          let evt;
          try {
            evt = JSON.parse(line.slice(EVENT_PREFIX.length));
          } catch {
            onLog(line);
            continue;
          }
          if (evt.event === 'done') done = evt;
          else if (evt.event === 'error') error = evt.message;
          else if (evt.event === 'log') onLog(evt.message);
          else onEvent(evt);
        } else {
          onLog(line);
        }
      }
    });
  };
  handleLines(child.stdout);
  handleLines(child.stderr);

  const promise = new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('close', (code) => {
      if (killed) return reject(new Error('Cancelado'));
      if (done) return resolve(done);
      reject(new Error(error || `El worker terminó con código ${code}`));
    });
  });

  return {
    promise,
    kill: () => {
      killed = true;
      child.kill('SIGTERM');
    },
  };
}

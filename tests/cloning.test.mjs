import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';
import { defaultsFor, getModel } from '../server/models.js';
import { validateCloningParams, validateCloningReference } from '../server/cloning.js';
import { pythonFor } from '../server/paths.js';
import { textForModel } from '../server/tags.js';

const model = getModel('voxcpm2');
test('rechaza ajustes que pueden romper inferencia y acepta los modos de clonación', () => {
  assert.deepEqual(validateCloningParams(model), defaultsFor(model));
  for (const params of [null, [], { reference_mode: 'fake' }, { cfg_value: 1 }, { cfg_value: null }, { inference_timesteps: 1.5 }, { max_tokens: Infinity }, { seed: -1 }, { seed: 2 ** 32 }, { silence_duration: '0.1' }, { instruct: 'x'.repeat(501) }]) assert.throws(() => validateCloningParams(model, params));
  for (const reference_mode of ['auto', 'reference', 'continuation', 'combined']) {
    const params = validateCloningParams(model, { reference_mode });
    assert.doesNotThrow(() => validateCloningReference(params, { transcript: 'Hola.' }, true));
    if (['continuation', 'combined'].includes(reference_mode)) assert.throws(() => validateCloningReference(params, { transcript: ' ' }, true));
    else assert.doesNotThrow(() => validateCloningReference(params, {}, true));
    assert.doesNotThrow(() => validateCloningReference(params, null, false));
  }
  assert.equal(textForModel('voxcpm2', '[whisper] Hola. <|emotion:anger|> <laugh> Gracias.'), 'Hola. Gracias.');
});

test('worker consume transcripción como contexto y conserva voz al dividir el guion', { skip: !existsSync(pythonFor('mlx')) }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'tts-voxcpm2-test-'));
  const root = new URL('..', import.meta.url).pathname;
  mkdirSync(join(dir, 'models/voxcpm2-4bit'), { recursive: true });
  writeFileSync(join(dir, 'params.json'), JSON.stringify(defaultsFor(model)));
  try {
    execFileSync(pythonFor('mlx'), ['-c', `
import json, sys
from types import SimpleNamespace
import numpy as np
sys.path.insert(0, ${JSON.stringify(join(root, 'workers'))})
import voxcpm2_worker as w
p = json.load(open(${JSON.stringify(join(dir, 'params.json'))}))
job = dict(params=p, ref_audio='speaker.wav', ref_text='Hola mundo.')
kwargs, mode = w.generation_kwargs(job)
assert mode == 'combined'
assert kwargs['prompt_audio'] == kwargs['ref_audio'] == 'speaker.wav'
assert kwargs['prompt_text'] == 'Hola mundo.' and 'ref_text' not in kwargs
job['ref_text'] = None
kwargs, mode = w.generation_kwargs(job)
assert mode == 'reference' and 'prompt_audio' not in kwargs
job['params']['reference_mode'] = 'continuation'
try: w.generation_kwargs(job); raise AssertionError('must reject missing transcript')
except ValueError: pass
job['ref_text'] = 'Hola mundo.'
kwargs, mode = w.generation_kwargs(job)
assert 'prompt_audio' in kwargs and 'ref_audio' not in kwargs
calls = []
class FakeModel:
    sample_rate = 48000
    def generate(self, text, **kwargs):
        calls.append(kwargs.copy())
        yield SimpleNamespace(audio=np.ones(48000, dtype=np.float32))
job.update(ref_audio=None, ref_text=None, text='Primera oración. Segunda oración. Tercera oración.')
job['params']['chunk_chars'] = 20
list(w.generate_chunks(job, FakeModel()))
assert len(calls) == 3 and 'ref_audio' not in calls[0]
assert isinstance(calls[1]['ref_audio'], np.ndarray)
assert calls[1]['ref_audio'] is calls[2]['ref_audio']
class SilentModel(FakeModel):
    def generate(self, text, **kwargs): yield SimpleNamespace(audio=np.zeros(48000))
try: list(w.generate_chunks(job, SilentModel())); raise AssertionError('must reject silent audio')
except RuntimeError: pass
`], { stdio: 'pipe' });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { defaultsFor, getModel } from '../server/models.js';
import { validateSupertonicParams, validateSupertonicStyle } from '../server/supertonic.js';
import { textForModel } from '../server/tags.js';

const model = getModel('supertonic');

test('catálogo, descarga y SDK usan la revisión y los valores compatibles', () => {
  const defaults = defaultsFor(model);
  assert.deepEqual(validateSupertonicParams(model), defaults);
  assert.equal(defaults.lang, 'es');
  assert.equal(defaults.speed, 1.05);
  assert.equal(defaults.total_steps, 8);
  assert.equal(model.reference.supported, false);
  assert.equal(model.params.find((p) => p.key === 'lang').options.length, 32);
  assert.equal(model.params.find((p) => p.key === 'voice_name').options.length, 10);
  const download = readFileSync(new URL('../scripts/download_models.py', import.meta.url), 'utf8');
  assert.ok(download.includes(model.repo));
  assert.ok(download.includes(model.revision));
});

test('parámetros inválidos no llegan a inferencia ni a presets', () => {
  for (const params of [{ total_steps: 0 }, { total_steps: 101 }, { total_steps: 8.5 }, { speed: 0.6 }, { speed: NaN }, { speed: '1.05' }, { max_chunk_length: 9 }, { silence_duration: -1 }, { intra_op_num_threads: -1 }, { seed: 2 ** 32 }, { lang: 'es-MX' }, { voice_name: 'F6' }, { verbose: 'false' }, { custom_style_path: 3 }]) {
    assert.throws(() => validateSupertonicParams(model, params));
  }
  assert.equal(validateSupertonicParams(model, { max_chunk_length: 0 }).max_chunk_length, 0);
});

test('etiquetas comunes se traducen a sonidos y los otros modelos no reciben tokens de Supertonic', () => {
  const text = '[excited] Hola. [laughing] Gracias. [inhale] Respira. [sigh] Adiós. <laugh> <breath> <sigh>';
  assert.equal(textForModel('supertonic', text), 'Hola. <laugh> Gracias. <breath> Respira. <sigh> Adiós. <laugh> <breath> <sigh>');
  for (const id of ['fish', 'higgs', 'cosyvoice', 'qwen', 'chatterbox']) {
    assert.doesNotMatch(textForModel(id, text), /<(?:laugh|breath|sigh)>/);
  }
  assert.equal(textForModel('supertonic', '[pause] [whisper] Hola <|speaker:0|> <|emotion:anger|> <strong>mundo</strong>.'), 'Hola mundo.');
});

test('los estilos JSON requieren ambos embeddings y formas del checkpoint', () => {
  const style = { style_ttl: { dims: [1, 50, 256], data: Array(12800).fill(0) }, style_dp: { dims: [1, 8, 16], data: Array(128).fill(0) } };
  assert.equal(validateSupertonicStyle(style), style);
  assert.throws(() => validateSupertonicStyle({}));
  assert.throws(() => validateSupertonicStyle({ ...style, style_dp: { dims: [1, 50, 256], data: Array(12800).fill(0) } }));
  assert.throws(() => validateSupertonicStyle({ ...style, style_dp: { dims: [1, 8, 16], data: [0] } }));
  assert.throws(() => validateSupertonicStyle({ ...style, style_dp: { dims: [1, 8, 16], data: Array(128).fill(Infinity) } }));
});

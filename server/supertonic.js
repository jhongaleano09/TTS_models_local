import { defaultsFor } from './models.js';

/** Valida los controles antes de encolar o guardar una toma. */
export function validateSupertonicParams(model, params = {}) {
  const clean = defaultsFor(model);
  for (const p of model.params) {
    const value = params?.[p.key] ?? p.default;
    if (p.type === 'select' && !p.options.includes(value)) throw new Error(`${p.label}: opción inválida.`);
    if (p.type === 'checkbox' && typeof value !== 'boolean') throw new Error(`${p.label}: usa sí o no.`);
    if (['number', 'slider'].includes(p.type)) {
      if (typeof value !== 'number' || !Number.isFinite(value) || value < p.min || (p.max !== undefined && value > p.max) || (p.step === 1 && !Number.isInteger(value))) throw new Error(`${p.label}: valor fuera de rango.`);
      if (p.key === 'seed' && value > 2_147_483_647) throw new Error('Semilla: máximo 2147483647.');
      if (p.key === 'max_chunk_length' && value > 0 && value < 10) throw new Error('Caracteres por fragmento: usa 0 (automático) o al menos 10.');
    }
    if (p.type === 'voice-style' && (typeof value !== 'string' || value.length > 4096)) throw new Error('Estilo JSON: ruta inválida.');
    clean[p.key] = value;
  }
  return clean;
}

/** Formas del checkpoint oficial: un hablante y dos embeddings. */
export function validateSupertonicStyle(style) {
  for (const [key, expected] of [['style_ttl', [1, 50, 256]], ['style_dp', [1, 8, 16]]]) {
    const vector = style?.[key];
    if (!vector || JSON.stringify(vector.dims) !== JSON.stringify(expected)) throw new Error(`${key}: dimensiones esperadas ${expected.join(' × ')}.`);
    const values = Array.isArray(vector.data) ? vector.data.flat(Infinity) : [];
    if (values.length !== expected.reduce((a, b) => a * b, 1) || values.some((v) => typeof v !== 'number' || !Number.isFinite(v))) throw new Error(`${key}: datos incompletos o inválidos.`);
  }
  return style;
}

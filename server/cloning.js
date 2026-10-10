import { defaultsFor } from './models.js';

/** Solo controles que realmente consume el runtime de VoxCPM2. */
export function validateCloningParams(model, params = {}) {
  if (!params || typeof params !== 'object' || Array.isArray(params)) throw new Error('Ajustes de voz inválidos.');
  const clean = defaultsFor(model);
  for (const p of model.params) {
    const value = params[p.key] === undefined ? p.default : params[p.key];
    if (p.type === 'select' && !p.options.includes(value)) throw new Error(`${p.label}: opción inválida.`);
    if (p.type === 'textarea' && (typeof value !== 'string' || value.length > p.maxLength)) throw new Error(`${p.label}: máximo ${p.maxLength} caracteres.`);
    if (['slider', 'number'].includes(p.type) && (typeof value !== 'number' || !Number.isFinite(value) || value < p.min || value > p.max || (p.type === 'number' && !Number.isInteger(value)))) throw new Error(`${p.label}: valor fuera de rango.`);
    clean[p.key] = value;
  }
  if (clean.min_tokens >= clean.max_tokens) throw new Error('El mínimo de pasos debe ser menor que el máximo.');
  return clean;
}

export function validateCloningReference(params, voice, useReference) {
  if (useReference && ['continuation', 'combined'].includes(params.reference_mode) && !voice?.transcript?.trim()) {
    throw new Error('Este modo de clonación requiere la transcripción de la voz. Escríbela en Voces o elige Automático / Solo timbre.');
  }
}

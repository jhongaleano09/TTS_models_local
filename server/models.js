// Catálogo de modelos del Arena: fuente única de parámetros para la UI y los workers.
// Rangos y valores por defecto tomados de las implementaciones oficiales
// (Space de Resemble para Chatterbox, mlx-audio 0.5.7 para Qwen3-TTS y Fish S2 Pro).

const seedParam = {
  key: 'seed',
  label: 'Semilla',
  type: 'number',
  default: 0,
  min: 0,
  step: 1,
  help: '0 = aleatoria. Fija un valor para reproducir el mismo resultado.',
};

export const MODELS = [
  {
    id: 'chatterbox',
    name: 'Chatterbox V3 es-MX/LatAm',
    repo: 'ResembleAI/Chatterbox-Multilingual-es-mx-latam',
    runtime: 'PyTorch · MPS',
    env: 'torch',
    worker: 'chatterbox_worker.py',
    license: 'MIT',
    size: '≈ 3 GB',
    summary: 'Fine-tune dedicado a español latinoamericano (es-419 / es-MX). Ganador de la investigación para voz latina.',
    reference: { supported: true, needsText: false, note: 'Clonación zero-shot: usa los primeros ~10 s del audio. Sin audio usa la voz integrada (inglés).' },
    textHint: 'Se divide automáticamente en fragmentos de hasta 300 caracteres (límite del Space oficial).',
    params: [
      { key: 'exaggeration', label: 'Exageración', type: 'slider', min: 0.25, max: 2, step: 0.05, default: 0.5, help: 'Intensidad emocional. 0.5 = neutral; valores altos aceleran el habla (compensa bajando CFG).' },
      { key: 'cfg_weight', label: 'CFG / ritmo', type: 'slider', min: 0, max: 1, step: 0.05, default: 0.5, help: 'Guía del condicionamiento. Más bajo = ritmo más pausado; 0 reduce la transferencia de acento de la referencia.' },
      { key: 'temperature', label: 'Temperatura', type: 'slider', min: 0.05, max: 2, step: 0.05, default: 0.8, help: 'Aleatoriedad del muestreo de tokens de voz.' },
      { key: 'top_p', label: 'Top-p', type: 'slider', min: 0.5, max: 1, step: 0.01, default: 0.95, advanced: true },
      { key: 'min_p', label: 'Min-p', type: 'slider', min: 0, max: 0.5, step: 0.01, default: 0.05, advanced: true },
      { key: 'repetition_penalty', label: 'Penalización de repetición', type: 'slider', min: 1, max: 2, step: 0.05, default: 1.2, advanced: true },
      { key: 'max_new_tokens', label: 'Máx. tokens por fragmento', type: 'number', min: 100, max: 2000, step: 50, default: 1000, advanced: true },
      { key: 'chunk_chars', label: 'Caracteres por fragmento', type: 'number', min: 80, max: 300, step: 10, default: 300, advanced: true },
      { key: 'device', label: 'Dispositivo', type: 'select', options: ['mps', 'cpu'], default: 'mps', advanced: true },
      seedParam,
    ],
  },
  {
    id: 'qwen',
    name: 'Qwen3-TTS 1.7B Base 4-bit',
    repo: 'mlx-community/Qwen3-TTS-12Hz-1.7B-Base-4bit',
    runtime: 'MLX · mlx-audio',
    env: 'mlx',
    worker: 'mlx_worker.py',
    license: 'Apache-2.0',
    size: '≈ 2.3 GB',
    summary: 'Equilibrio calidad/memoria. Base no tiene voces predefinidas: brilla clonando una referencia latina.',
    reference: { supported: true, needsText: false, note: 'Con audio + transcripción usa clonación ICL (mejor). Solo audio: modo x-vector (timbre). Sin audio: voz aleatoria.' },
    textHint: 'Cada salto de línea se genera como un segmento independiente.',
    params: [
      { key: 'lang_code', label: 'Idioma', type: 'select', options: ['spanish', 'auto', 'english', 'portuguese', 'french', 'italian', 'german'], default: 'spanish', help: 'Token de idioma del codec.' },
      { key: 'temperature', label: 'Temperatura', type: 'slider', min: 0.1, max: 1.5, step: 0.05, default: 0.9 },
      { key: 'top_k', label: 'Top-k', type: 'number', min: 1, max: 200, step: 1, default: 50 },
      { key: 'top_p', label: 'Top-p', type: 'slider', min: 0.1, max: 1, step: 0.01, default: 1.0 },
      { key: 'repetition_penalty', label: 'Penalización de repetición', type: 'slider', min: 1, max: 2, step: 0.05, default: 1.05, help: 'En modo ICL (audio + transcripción) mlx-audio fuerza un mínimo de 1.5.' },
      { key: 'max_tokens', label: 'Máx. tokens por segmento', type: 'number', min: 256, max: 8192, step: 128, default: 4096, advanced: true, help: '12.5 tokens ≈ 1 s de audio.' },
      { key: 'split_lines', label: 'Dividir por saltos de línea', type: 'checkbox', default: true, advanced: true },
      seedParam,
    ],
  },
  {
    id: 'fish',
    name: 'Fish Audio S2 Pro 4-bit',
    repo: 'majentik/fishaudio-s2-pro-MLX-4bit (+ codec mlx-community)',
    runtime: 'MLX · mlx-audio',
    env: 'mlx',
    worker: 'mlx_worker.py',
    license: 'Fish Audio Research (no comercial)',
    size: '≈ 4.4 GB',
    summary: 'El mayor techo expresivo: etiquetas inline como [whisper], [laughing], [sigh]. 16 GB es el mínimo recomendado.',
    reference: { supported: true, needsText: true, note: 'Clonación con audio + transcripción. Sin transcripción la clonación pierde calidad.' },
    textHint: 'Etiquetas entre corchetes justo antes de las palabras que modifican: [pause] [short pause] [emphasis] [whisper] [low voice] [excited] [surprised] [sigh] [laughing]… Úsalas con moderación (1–2 por párrafo). Los otros modelos reciben el texto sin etiquetas. <|speaker:0|> / <|speaker:1|> para diálogos.',
    attribution: 'Built with Fish Audio',
    params: [
      { key: 'instruct', label: 'Instrucción de estilo', type: 'textarea', default: '', help: 'Descripción libre del estilo, p. ej. "Narradora cálida, acento mexicano, ritmo pausado".' },
      { key: 'temperature', label: 'Temperatura', type: 'slider', min: 0.1, max: 1.5, step: 0.05, default: 0.7 },
      { key: 'top_p', label: 'Top-p', type: 'slider', min: 0.1, max: 1, step: 0.01, default: 0.7 },
      { key: 'top_k', label: 'Top-k', type: 'number', min: 1, max: 200, step: 1, default: 30 },
      { key: 'speed', label: 'Velocidad', type: 'slider', min: 0.5, max: 2, step: 0.05, default: 1.0, help: 'Post-procesado del audio generado.' },
      { key: 'max_tokens', label: 'Máx. tokens por bloque', type: 'number', min: 256, max: 4096, step: 128, default: 1024, advanced: true, help: '≈ 21.5 tokens por segundo de audio.' },
      { key: 'chunk_length', label: 'Bytes por bloque', type: 'number', min: 100, max: 1000, step: 50, default: 300, advanced: true, help: 'El texto se divide por oraciones en bloques de este tamaño, generados en orden y manteniendo el contexto de la voz.' },
      seedParam,
    ],
  },
];

export function defaultsFor(model) {
  return Object.fromEntries(model.params.map((p) => [p.key, p.default]));
}

export function getModel(id) {
  return MODELS.find((m) => m.id === id);
}

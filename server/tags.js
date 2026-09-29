// Etiquetas expresivas por modelo.
//
// Los guiones se escriben en el "dialecto" de Fish S2 Pro ([pause], [emphasis], [sigh]…), que es
// el más legible y el que usan las plantillas. Antes de mandar el texto a cada worker se traduce:
//   - Fish:       lo recibe tal cual.
//   - Higgs:      [etiqueta] → <|categoría:valor|> (catálogo oficial de 43 tokens de Higgs TTS 3).
//   - CosyVoice3: [etiqueta] → sus tokens de control fino ([breath], <strong>…</strong>, [laughter]…).
//   - Chatterbox y Qwen: sin etiquetas (las leerían en voz alta).
// También se aceptan etiquetas nativas de cada modelo; al resto de modelos les llegan eliminadas.

const HIGGS_TOKEN = /<\|(?:emotion|style|sfx|prosody|env):[a-z_]+\|>/g;
const SPEAKER_TAG = /<\|speaker:\d+\|>/g;
const COSY_SPAN = /<\/?(?:strong|laughter)>/g;
const BRACKET_TAG = /\[([^\]\n]{1,40})\]/g;

// Tokens de control fino del tokenizer de CosyVoice3 (se respetan si vienen escritos a mano).
const COSY_NATIVE = new Set(['breath', 'quick_breath', 'laughter', 'sigh', 'cough', 'noise', 'lipsmack', 'mn', 'clucking', 'hissing', 'vocalized-noise', 'accent']);

// Fish → Higgs. Las de emoción/estilo/velocidad colorean la oración que empieza tras ellas;
// pausas y sonidos van en el punto exacto. Los sfx de Higgs piden la onomatopeya pegada al token.
const FISH_TO_HIGGS = {
  pause: '<|prosody:long_pause|>',
  'long pause': '<|prosody:long_pause|>',
  'short pause': '<|prosody:pause|>',
  whisper: '<|style:whispering|>',
  whispering: '<|style:whispering|>',
  'low voice': '<|prosody:expressive_low|>',
  'low volume': '<|prosody:expressive_low|>',
  'volume down': '<|prosody:expressive_low|>',
  loud: '<|style:shouting|>',
  shouting: '<|style:shouting|>',
  'volume up': '<|prosody:expressive_high|>',
  excited: '<|emotion:enthusiasm|>',
  'excited tone': '<|emotion:enthusiasm|>',
  delight: '<|emotion:elation|>',
  happy: '<|emotion:elation|>',
  surprised: '<|emotion:surprise|>',
  shocked: '<|emotion:surprise|>',
  sad: '<|emotion:sadness|>',
  angry: '<|emotion:anger|>',
  scared: '<|emotion:fear|>',
  curious: '<|emotion:contemplation|>',
  thoughtful: '<|emotion:contemplation|>',
  confused: '<|emotion:confusion|>',
  calm: '<|emotion:contentment|>',
  relieved: '<|emotion:relief|>',
  'warm tone': '<|emotion:affection|>',
  warm: '<|emotion:affection|>',
  serious: '<|emotion:determination|>',
  proud: '<|emotion:pride|>',
  'laughing tone': '<|emotion:amusement|>',
  amused: '<|emotion:amusement|>',
  sigh: '<|sfx:sigh|>Ahh, ',
  laughing: '<|sfx:laughter|>Jaja, ',
  laugh: '<|sfx:laughter|>Jaja, ',
  chuckle: '<|sfx:laughter|>Je, ',
  'clearing throat': '<|sfx:cough|>Ejem, ',
  cough: '<|sfx:cough|>Ejem, ',
  crying: '<|sfx:crying|>',
  sniff: '<|sfx:sniff|>',
  humming: '<|sfx:humming|>Mmm, ',
  fast: '<|prosody:speed_fast|>',
  slow: '<|prosody:speed_slow|>',
};

// Fish → CosyVoice3. [emphasis] se convierte en <strong>…</strong> hasta el siguiente signo de puntuación.
const FISH_TO_COSY = {
  pause: '[breath]',
  'long pause': '[breath]',
  inhale: '[breath]',
  exhale: '[breath]',
  panting: '[quick_breath]',
  laughing: '[laughter]',
  laugh: '[laughter]',
  chuckle: '[laughter]',
  sigh: '[sigh]',
  'clearing throat': '[cough]',
  cough: '[cough]',
  tsk: '[lipsmack]',
};

const tidy = (text) =>
  text
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/ +([,.;:!?…])/g, '$1')
    .replace(/^[ \t]+|[ \t]+$/gm, '')
    .trim();

const stripAll = (text) => tidy(text.replace(SPEAKER_TAG, ' ').replace(HIGGS_TOKEN, ' ').replace(COSY_SPAN, '').replace(BRACKET_TAG, ' '));

function toFish(text) {
  return tidy(text.replace(HIGGS_TOKEN, ' ').replace(COSY_SPAN, ''));
}

function toHiggs(text) {
  const out = text
    .replace(SPEAKER_TAG, ' ')
    .replace(COSY_SPAN, '')
    .replace(BRACKET_TAG, (_, raw) => FISH_TO_HIGGS[raw.trim().toLowerCase()] ?? ' ');
  return (
    tidy(out)
      // La guía oficial escribe los tokens de oración pegados a la primera palabra.
      .replace(/(<\|(?:emotion|style):[a-z_]+\|>|<\|prosody:(?:speed|pitch|expressive)_[a-z_]+\|>)[ \t]+/g, '$1')
      // "Ahh, Después…" → "Ahh, después…": la onomatopeya abre la oración.
      .replace(/(<\|sfx:[a-z]+\|>\p{L}+, )([¿¡]?)(\p{Lu})/gu, (_, sfx, mark, letter) => sfx + mark + letter.toLowerCase())
  );
}

function toCosy(text) {
  const out = text
    .replace(SPEAKER_TAG, ' ')
    .replace(HIGGS_TOKEN, ' ')
    .replace(/\[emphasis\]\s*([^.,;:!?…\n“”"«»\[<]+)/gi, (_, words) => `<strong>${words.trim()}</strong> `)
    .replace(BRACKET_TAG, (_, raw) => {
      const tag = raw.trim().toLowerCase();
      if (COSY_NATIVE.has(tag)) return `[${tag}]`;
      return FISH_TO_COSY[tag] ?? ' ';
    });
  // Un [breath] al inicio de oración o de fragmento hace alucinar sílabas sueltas; entre
  // oraciones ya hay pausa natural, así que solo se conserva dentro de la oración.
  return tidy(out.replace(/(^|[.!?…:;]["”»]?\s*)(?:\[(?:breath|quick_breath)\]\s*)+/gm, '$1'));
}

const CONVERTERS = { fish: toFish, higgs: toHiggs, cosyvoice: toCosy };

/** Texto que recibe cada modelo a partir del guion común. */
export function textForModel(modelId, text) {
  return (CONVERTERS[modelId] ?? stripAll)(text);
}

# Modelos del Arena y sus parámetros

Los tres modelos recomendados por la [investigación base](investigacion/investigacion_base_TTS.md) para una MacBook Air M5 de 16 GB. Todos los parámetros de la interfaz salen de `server/models.js` y están tomados de las implementaciones oficiales que usa el proyecto.

Mediciones reales en la MacBook Air M5 16 GB (frase de ~115 caracteres, con clonación de la voz de referencia es-MX):

| Modelo | Carga | Generación | Audio | RTF | Memoria pico |
|---|---:|---:|---:|---:|---:|
| Chatterbox V3 es-MX/LatAm | 7.5 s | 10.8 s | 7.2 s | 1.49 | 6.4 GB |
| Qwen3-TTS 1.7B Base 4-bit | 1.7 s | 5.2 s | 8.8 s | 0.59 | 6.9 GB |
| Fish Audio S2 Pro 4-bit | 2.2 s | 22.1 s | 7.9 s | 2.82 | 9.1 GB |

RTF = segundos de generación por segundo de audio (menor que 1 = más rápido que tiempo real).

---

## 1. Chatterbox Multilingual V3 — es-MX/LatAm

- **Checkpoint:** [`ResembleAI/Chatterbox-Multilingual-es-mx-latam`](https://huggingface.co/ResembleAI/Chatterbox-Multilingual-es-mx-latam) (`t3_es_mx_latam.safetensors` + `s3gen_v3.pt`), más `ve.pt`, tokenizer y `conds.pt` de `ResembleAI/chatterbox`.
- **Runtime:** PyTorch 2.8 en MPS. El código V3 se tomó del [Space oficial](https://huggingface.co/spaces/ResembleAI/Chatterbox-Multilingual-TTS-es-mx-latam) porque el paquete `chatterbox-tts` de PyPI aún no lo incluye (ver `workers/vendor/VENDOR.md`).
- **Licencia:** MIT. Los audios llevan la marca de agua imperceptible Perth de Resemble.

| Parámetro | Rango | Defecto | Efecto |
|---|---|---|---|
| `exaggeration` | 0.25 – 2 | 0.5 | Intensidad emocional. Valores altos también aceleran el habla. |
| `cfg_weight` | 0 – 1 | 0.5 | Peso del condicionamiento. Bajarlo (≈0.3) hace el ritmo más pausado; 0 reduce la transferencia de acento de la referencia. |
| `temperature` | 0.05 – 2 | 0.8 | Aleatoriedad del muestreo. |
| `top_p` | 0.5 – 1 | 0.95 | Muestreo por núcleo. |
| `min_p` | 0 – 0.5 | 0.05 | Descarta tokens con probabilidad relativa baja. |
| `repetition_penalty` | 1 – 2 | 1.2 | Evita bucles de tokens. |
| `max_new_tokens` | 100 – 2000 | 1000 | Máximo de tokens de voz por fragmento (25 tokens ≈ 1 s). |
| `chunk_chars` | 80 – 300 | 300 | El texto se divide por oraciones en fragmentos de este tamaño (el Space limita a 300). |
| `device` | mps / cpu | mps | |
| `seed` | entero | 0 (aleatoria) | |

Consejos de Resemble: para voces expresivas usa `exaggeration` ≈ 0.7 y `cfg_weight` ≈ 0.3. Si la referencia habla rápido, baja `cfg_weight`.

**Ajuste de memoria importante:** el allocator de MPS cachea un bloque por cada tamaño del KV-cache creciente y con los límites por defecto llega a ~18 GB (swap en 16 GB, generación 4× más lenta). El worker fija `PYTORCH_MPS_HIGH_WATERMARK_RATIO=0.7` y `PYTORCH_MPS_LOW_WATERMARK_RATIO=0.5`.

## 2. Qwen3-TTS 12Hz 1.7B Base — MLX 4-bit

- **Checkpoint:** [`mlx-community/Qwen3-TTS-12Hz-1.7B-Base-4bit`](https://huggingface.co/mlx-community/Qwen3-TTS-12Hz-1.7B-Base-4bit)
- **Runtime:** [`mlx-audio`](https://github.com/Blaizzy/mlx-audio) 0.5.7.
- **Licencia:** Apache-2.0.

La variante **Base** no trae voces predefinidas. Tres modos según la referencia:

| Referencia | Modo | Resultado |
|---|---|---|
| Audio + transcripción | ICL (in-context learning) | La mejor clonación de timbre y acento. |
| Solo audio | x-vector | Copia el timbre, no tanto la prosodia. |
| Nada | — | Voz aleatoria en cada generación. |

| Parámetro | Rango | Defecto | Efecto |
|---|---|---|---|
| `lang_code` | spanish, auto, english… | spanish | Token de idioma del codec. |
| `temperature` | 0.1 – 1.5 | 0.9 | |
| `top_k` | 1 – 200 | 50 | |
| `top_p` | 0.1 – 1 | 1.0 | |
| `repetition_penalty` | 1 – 2 | 1.05 | En modo ICL mlx-audio fuerza un mínimo de 1.5. |
| `max_tokens` | 256 – 8192 | 4096 | Por segmento; 12.5 tokens ≈ 1 s. |
| `split_lines` | sí / no | sí | Cada salto de línea es un segmento independiente. |
| `seed` | entero | 0 | |

## 3. Fish Audio S2 Pro — MLX 4-bit

- **Checkpoint:** LLM 4-bit de [`majentik/fishaudio-s2-pro-MLX-4bit`](https://huggingface.co/majentik/fishaudio-s2-pro-MLX-4bit) + `codec.safetensors` de [`mlx-community/fish-audio-s2-pro-8bit`](https://huggingface.co/mlx-community/fish-audio-s2-pro-8bit), ensamblados en `models/fish-s2-pro-4bit/`.
- **Por qué el ensamblado:** el port 4-bit publica el codec como `codec.pth`, pero el loader de mlx-audio solo reconoce `codec.safetensors`; sin él carga los pesos del LLM como codec (con `strict=False`) y el resultado es ruido.
- **Licencia:** Fish Audio Research License: uso no comercial; comercial requiere acuerdo con Fish Audio. Built with Fish Audio.

| Parámetro | Rango | Defecto | Efecto |
|---|---|---|---|
| `instruct` | texto libre | vacío | Instrucción de estilo global, p. ej. "narradora cálida con acento mexicano". |
| `temperature` | 0.1 – 1.5 | 0.7 | |
| `top_p` | 0.1 – 1 | 0.7 | |
| `top_k` | 1 – 200 | 30 | |
| `speed` | 0.5 – 2 | 1.0 | Cambio de velocidad posterior a la generación. |
| `max_tokens` | 256 – 4096 | 1024 | Por bloque (≈ 21.5 tokens por segundo de audio). |
| `chunk_length` | 100 – 1000 | 300 | Bytes de texto por bloque en textos largos (mantiene el contexto). |
| `seed` | entero | 0 | |

**Etiquetas inline** (solo Fish; el servidor las elimina del texto que reciben los otros modelos):
`[pause]` `[short pause]` `[emphasis]` `[whisper]` `[low voice]` `[laughing]` `[chuckle]` `[sigh]` `[inhale]` `[exhale]` `[excited]` `[sad]` `[angry]` `[surprised]` `[shouting]` `[volume up]` `[volume down]` `[clearing throat]`… Acepta descripciones libres entre corchetes. Para diálogos: `<|speaker:0|>Hola. <|speaker:1|>¿Qué tal?`

La clonación usa audio + transcripción; sin transcripción pierde precisión.

---

## Transcripción de voces (Whisper)

Qwen (ICL) y Fish clonan mejor con la transcripción exacta de la referencia. La pestaña **Voces** la genera con [`mlx-community/whisper-large-v3-turbo-asr-8bit`](https://huggingface.co/mlx-community/whisper-large-v3-turbo-asr-8bit), que también pasa por la cola secuencial.

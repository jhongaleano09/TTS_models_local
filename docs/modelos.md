# Modelos del Arena y sus parámetros

Los cinco modelos recomendados por la [investigación base](investigacion/investigacion_base_TTS.md) para una MacBook Air M5 de 16 GB. Todos los parámetros de la interfaz salen de `server/models.js` y están tomados de las implementaciones oficiales que usa el proyecto. Se ejecutan **uno tras otro**: cada modelo corre en su propio proceso, que al terminar libera la memoria antes de cargar el siguiente.

Mediciones reales en la MacBook Air M5 16 GB (frase de ~115 caracteres, con clonación de la voz de referencia es-MX):

| Modelo | Carga | Generación | Audio | RTF | Memoria pico |
|---|---:|---:|---:|---:|---:|
| Chatterbox V3 es-MX/LatAm | 7.5 s | 10.8 s | 7.2 s | 1.49 | 6.4 GB |
| Qwen3-TTS 1.7B Base 4-bit | 1.7 s | 5.2 s | 8.8 s | 0.59 | 6.9 GB |
| Fish Audio S2 Pro 4-bit | 2.2 s | 22.1 s | 7.9 s | 2.82 | 9.1 GB |

Corrida completa de los cinco modelos en secuencia (texto etiquetado de ~300 caracteres, voz de referencia es-MX con transcripción). Cada modelo carga, genera y libera la memoria antes del siguiente:

| Modelo | Carga | Generación | Audio | RTF | Memoria pico |
|---|---:|---:|---:|---:|---:|
| Chatterbox V3 es-MX/LatAm | 10.0 s | 23.8 s | 16.5 s | 1.44 | 6.5 GB |
| Qwen3-TTS 1.7B Base 4-bit | 1.7 s | 7.8 s | 19.8 s | 0.39 | 7.0 GB |
| Fish Audio S2 Pro 4-bit | 2.1 s | 35.3 s | 19.5 s | 1.81 | 11.0 GB |
| Higgs TTS 3 4B 6-bit | 2.4 s | 21.2 s | 25.3 s | 0.84 | 5.5 GB |
| CosyVoice3 0.5B 4-bit | 3.4 s | 8.2 s | 22.6 s | 0.36 | 3.7 GB |

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
| `chunk_length` | 100 – 1000 | 300 | Bytes de texto por bloque. El worker divide por oraciones y genera los bloques en orden, manteniendo el contexto. |
| `seed` | entero | 0 | |

### Cómo usar las etiquetas de Fish

Fish S2 Pro acepta instrucciones en lenguaje natural entre corchetes, **dentro del texto**. Sin ellas lee de forma correcta pero plana; son lo que le da contraste. El servidor las traduce para Higgs y CosyVoice3 y las elimina del texto que reciben Chatterbox y Qwen (ver [Traducción de etiquetas](#traducción-de-etiquetas-entre-modelos)), así que un mismo texto etiquetado sirve para comparar los cinco.

Reglas prácticas:

1. **La etiqueta va justo antes de lo que modifica.** `Ahora importan mucho más [emphasis] la velocidad…` enfatiza "la velocidad"; ponerla al final de la frase no sirve.
2. **Con moderación: una o dos por párrafo.** Si todo lleva `[emphasis]`, nada destaca y el modelo tiende a sonar forzado.
3. **Las pausas se escriben, no se deducen.** `[short pause]` antes de una revelación ("…que merece atención: [short pause] [emphasis] los modelos abiertos.") o `[pause]` para cambiar de bloque. Los puntos suspensivos ayudan, pero la etiqueta es más fiable.
4. **Una emoción al inicio de la frase afecta a toda la frase.** `[surprised] “No puede ser… [short pause] [excited] ¿de verdad consiguió hacerlo?”` cambia de sorpresa a entusiasmo a mitad de la cita.
5. **Deja algo sin etiquetar para contrastar.** En "IA, hardware y voz", la segunda versión de "Después de varios intentos, finalmente funcionó" va sin etiquetas a propósito.
6. **Escribe números y siglas como quieres oírlos** ("cuatro punto ocho gigabytes"); las etiquetas no corrigen la normalización.

| Tipo | Etiquetas |
|---|---|
| Ritmo | `[pause]` `[short pause]` `[emphasis]` `[interrupting]` |
| Volumen | `[whisper]` `[low voice]` `[low volume]` `[volume up]` `[volume down]` `[loud]` `[shouting]` |
| Emoción | `[excited]` `[surprised]` `[shocked]` `[sad]` `[angry]` `[delight]` `[excited tone]` `[laughing tone]` |
| Sonidos | `[sigh]` `[inhale]` `[exhale]` `[laughing]` `[chuckle]` `[clearing throat]` `[tsk]` `[panting]` |
| Libres | Cualquier descripción corta: `[serious]` `[calm]` `[curious]` `[warm tone]`. Las etiquetas en inglés son las más fiables porque son las del entrenamiento. |

Diálogos: `<|speaker:0|>Hola. <|speaker:1|>¿Qué tal?` (la voz de referencia es el hablante 0).

La **Instrucción de estilo** (`instruct`) complementa las etiquetas con un tono global, p. ej. "Presentadora de noticias latinoamericana, cercana y dinámica, con cambios de ritmo". Las etiquetas controlan momentos concretos y la instrucción, el conjunto.

Los accesos rápidos de la Arena (`public/samples.js`) son seis guiones de noticiero ya etiquetados con estas reglas. Cada uno fija también el tono global en cada modelo que lo admite: la instrucción de estilo de Fish, la entrega y el ritmo de Higgs y la instrucción de CosyVoice3. Todo se puede editar antes de generar.

**Textos largos:** mlx-audio solo aplica `chunk_length` si el texto trae etiquetas de hablante; sin ellas manda todo en un bloque y el audio se corta en `max_tokens` (≈ 47 s con 1024). El worker divide el texto por oraciones en turnos `<|speaker:0|>` de hasta `chunk_length` bytes. Con un guion de 2100 caracteres: 134 s de audio en 9 bloques, RTF 1.72, pico de 12.5 GB.

La clonación usa audio + transcripción; sin transcripción pierde precisión.

---

## 4. Higgs TTS 3 4B — MLX 6-bit

- **Checkpoint:** [`whitelabel/mlx-q6-higgs-tts-3-4b`](https://huggingface.co/whitelabel/mlx-q6-higgs-tts-3-4b), cuantizado de [`bosonai/higgs-tts-3-4b`](https://huggingface.co/bosonai/higgs-tts-3-4b) con `mlx_audio.convert` (6 bits, group size 64). Trae `codec.safetensors` y `model_type=higgs_audio_v3` ya corregidos.
- **Por qué este y no el Q4:** tal como advierte la investigación, `Reza2kn/Higgs-Audio-v3-TTS-4bit-MLX` no es un runtime completo; y el autor del Q6 descartó su propio Q4 en pruebas de escucha.
- **Runtime:** `mlx-audio` 0.5.7 (mismo entorno `.venvs/mlx` que Qwen y Fish).
- **Licencia:** Boson Higgs TTS 3 Research and Non-Commercial License. Los creadores digitales pueden monetizar contenido acreditando *"This audio was created with Boson AI's Higgs Audio"*; producción, APIs o productos requieren licencia comercial.

| Parámetro | Rango | Defecto | Efecto |
|---|---|---|---|
| `delivery` | natural / expresiva / contenida | natural | Antepone `<\|prosody:expressive_high\|>` o `<\|prosody:expressive_low\|>` a cada oración. |
| `pace` | normal / muy lento / lento / rápido / muy rápido | normal | Token de velocidad por oración (≈0.65×, 0.85×, 1.2×, 1.4×). |
| `temperature` | 0.1 – 1.5 | 0.8 | Valor recomendado por Boson para clonación. |
| `top_k` | 1 – 200 | 50 | Recomendado por Boson. |
| `top_p` | 0.1 – 1 | 1 | 1 = desactivado. |
| `max_new_tokens` | 256 – 4096 | 1024 | Frames por fragmento (25 frames ≈ 1 s). |
| `chunk_chars` | 80 – 600 | 300 | El texto se divide por oraciones en fragmentos de este tamaño. |
| `seed` | entero | 0 | |

**Referencia:** audio + transcripción (la transcripción "mejora materialmente la fidelidad", según Boson). El worker codifica la referencia una sola vez y la reutiliza en todos los fragmentos. **Sin referencia**, Higgs inventa una voz; para que no cambie entre fragmentos, el primer fragmento generado pasa a ser la referencia de los siguientes.

**Textos largos:** mlx-audio genera todo el texto de una vez y corta en `max_new_tokens`, así que el worker divide por oraciones (igual que con Chatterbox) y une los fragmentos con 120 ms de silencio. Con el guion "Espacio y autonomía" (2100 caracteres): 156 s de audio en 9 fragmentos, RTF 0.94, pico de 5.6 GB, y Whisper transcribe el texto completo sin errores.

### Tokens de control de Higgs

Formato `<|categoría:valor|>`. Solo se reconocen los 43 del catálogo oficial ([PROMPTING.md](https://huggingface.co/bosonai/higgs-tts-3-4b/blob/main/PROMPTING.md)); cualquier otro degrada la salida o se lee en voz alta.

| Categoría | Colocación | Valores |
|---|---|---|
| `emotion` | Inicio de oración | elation, amusement, enthusiasm, determination, pride, contentment, affection, relief, contemplation, confusion, surprise, awe, longing, arousal, anger, fear, disgust, bitterness, sadness, shame, helplessness |
| `style` | Inicio de oración | singing, shouting, whispering |
| `prosody` | Inicio de oración | speed_very_slow, speed_slow, speed_fast, speed_very_fast, pitch_low, pitch_high, expressive_high, expressive_low |
| `prosody` | En el punto exacto | pause (≈0.4–0.7 s), long_pause (≈0.7–1.5 s) |
| `sfx` | En el punto exacto, con onomatopeya pegada | cough, laughter, crying, screaming, burping, humming, sigh, sniff, sneeze |

Ejemplo: `<|emotion:surprise|>¡No puede ser! <|prosody:pause|> <|sfx:laughter|>Jaja, ¿de verdad lo consiguió?`. Se pueden escribir directamente en el texto; los demás modelos los reciben eliminados.

## 5. Fun-CosyVoice3 0.5B — MLX 4-bit

- **Checkpoint:** [`mlx-community/Fun-CosyVoice3-0.5B-2512-4bit`](https://huggingface.co/mlx-community/Fun-CosyVoice3-0.5B-2512-4bit) + tokenizer de voz [`mlx-community/S3TokenizerV3`](https://huggingface.co/mlx-community/S3TokenizerV3).
- **Runtime:** [`mlx-audio-plus`](https://github.com/DePasqualeOrg/mlx-audio-plus) 0.1.8, en su **propio entorno `.venvs/cosyvoice`**: es un fork que se instala como el paquete `mlx_audio` y chocaría con el mlx-audio de los demás. Además arrastra `mlx-audio` 0.2.10 como dependencia, que sobrescribe 41 archivos compartidos; `setup.sh` reinstala el fork con `--no-deps` al final para restaurarlos.
- **Licencia:** Apache-2.0.

CosyVoice3 **siempre clona una referencia**; sin voz elegida, el servidor usa la voz demo es-MX incluida. Modos:

| Modo | Cuándo (en `auto`) | Qué hace |
|---|---|---|
| zero-shot | La voz tiene transcripción | Clona timbre y prosodia; la mejor fidelidad de acento. |
| cross-lingual | Solo audio | Clona el timbre sin alinear con el texto de la referencia. |
| instruct | Hay instrucción de estilo | Timbre de la referencia + estilo de la instrucción. El LLM no ve los tokens de la referencia, así que el acento lo pone más el modelo que la voz: para conservar el acento latino, usa zero-shot. |

El worker antepone el prefijo con el que se entrenó el modelo (`You are a helpful assistant.<|endofprompt|>`) a la transcripción, al texto (cross-lingual) o a la instrucción; mlx-audio-plus no lo hace.

| Parámetro | Rango | Defecto | Efecto |
|---|---|---|---|
| `mode` | auto, zero-shot, cross-lingual, instruct | auto | Ver tabla anterior. |
| `instruct` | texto libre (inglés) | vacío | P. ej. "Speak warmly and slowly, like a news anchor." |
| `speed` | 0.5 – 2 | 1.0 | Estiramiento temporal posterior con librosa (no cambia el tono). mlx-audio-plus ignora su propio `speed`. |
| `chunk_chars` | 80 – 400 | 200 | Fragmentos por oración; cada uno clona la misma referencia. |
| `seed` | entero | 0 | |

La temperatura y el top-k no se exponen porque mlx-audio-plus los fija internamente (muestreo RAS con top-k 25).

**Textos largos:** con el guion "Espacio y autonomía" en modo instruct: 143 s de audio en 12 fragmentos, RTF 0.62, pico de 3.8 GB. Es el modelo más pequeño y se nota: de vez en cuando deforma alguna palabra, así que conviene escuchar el resultado completo.

**Control fino en el texto:** `[breath]`, `[quick_breath]`, `[laughter]`, `[sigh]`, `[cough]`, `[lipsmack]`, `[noise]`, `[mn]` en el punto exacto, y `<strong>palabras</strong>` o `<laughter>palabras</laughter>` para envolver un tramo.

---

## Traducción de etiquetas entre modelos

Los guiones se escriben con las etiquetas de Fish y `server/tags.js` las traduce antes de lanzar cada worker. También se pueden escribir etiquetas nativas de Higgs (`<|…|>`) o CosyVoice3 (`<strong>`, `[breath]`); a los demás modelos les llegan eliminadas.

| Fish (guion) | Higgs TTS 3 | CosyVoice3 | Chatterbox / Qwen |
|---|---|---|---|
| `[short pause]` | `<\|prosody:pause\|>` | — | — |
| `[pause]` | `<\|prosody:long_pause\|>` | `[breath]` (solo dentro de la oración) | — |
| `[emphasis] palabras` | — (sin equivalente) | `<strong>palabras</strong>` hasta la siguiente puntuación | — |
| `[whisper]` | `<\|style:whispering\|>` | — | — |
| `[low voice]` `[low volume]` | `<\|prosody:expressive_low\|>` | — | — |
| `[loud]` `[shouting]` | `<\|style:shouting\|>` | — | — |
| `[excited]` | `<\|emotion:enthusiasm\|>` | — | — |
| `[surprised]` `[shocked]` | `<\|emotion:surprise\|>` | — | — |
| `[curious]` | `<\|emotion:contemplation\|>` | — | — |
| `[calm]` | `<\|emotion:contentment\|>` | — | — |
| `[warm tone]` | `<\|emotion:affection\|>` | — | — |
| `[serious]` | `<\|emotion:determination\|>` | — | — |
| `[sad]` `[angry]` | `<\|emotion:sadness\|>` `<\|emotion:anger\|>` | — | — |
| `[sigh]` | `<\|sfx:sigh\|>Ahh,` | `[sigh]` | — |
| `[laughing]` `[chuckle]` | `<\|sfx:laughter\|>Jaja,` | `[laughter]` | — |
| `[clearing throat]` | `<\|sfx:cough\|>Ejem,` | `[cough]` | — |
| `[inhale]` `[exhale]` | — | `[breath]` | — |

Las emociones no tienen token en CosyVoice3: el tono global se da con su instrucción de estilo. Las etiquetas sin traducción se eliminan. En CosyVoice3, un `[breath]` al inicio de oración o de fragmento hacía alucinar sílabas sueltas, así que solo se conserva dentro de la oración (entre oraciones ya hay pausa natural).

---

## Transcripción de voces (Whisper)

Qwen (ICL), Fish, Higgs y CosyVoice3 (zero-shot) clonan mejor con la transcripción exacta de la referencia. La pestaña **Voces** la genera con [`mlx-community/whisper-large-v3-turbo-asr-8bit`](https://huggingface.co/mlx-community/whisper-large-v3-turbo-asr-8bit), que también pasa por la cola secuencial.

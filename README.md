# TTS Arena local

Última comprobación del entorno y recuperación del proyecto: [validación del 9 de octubre de 2026](docs/validacion-2026-10-09.md).

Arena para comparar modelos de texto a voz en español latino **100 % en local**, en una Mac con Apple Silicon. Escribes un texto, ajustas los parámetros de cada modelo, pulsas **Generar** y los modelos se ejecutan **uno tras otro**: cada uno se carga, genera su WAV y libera la memoria antes de cargar el siguiente. Probado en una MacBook Air M5 de 16 GB.

| Modelo | Runtime | Por qué está aquí |
|---|---|---|
| **Chatterbox V3 es-MX/LatAm** | PyTorch · MPS | Fine-tune dedicado a español latinoamericano (es-419 / es-MX). |
| **Qwen3-TTS 1.7B Base 4-bit** | MLX | El más rápido; clonación excelente con audio + transcripción. |
| **Fish Audio S2 Pro 4-bit** | MLX | El más expresivo: etiquetas `[whisper]`, `[laughing]`, `[sigh]`… |
| **Higgs TTS 3 4B 6-bit** | MLX | Paralingüística fuerte: tokens `<\|emotion:…\|>`, `<\|sfx:laughter\|>`, pausas. |
| **CosyVoice3 0.5B 4-bit** | MLX (mlx-audio-plus) | El más ligero de los modelos MLX; clonación zero-shot e instrucciones de estilo. |
| **Supertonic 3** | ONNX Runtime · CPU | Supertone: 31 idiomas, 10 voces, estilos JSON y audio 44.1 kHz con ~0.4 GB de pesos. |
| **VoxCPM2 2B 4-bit** | MLX | Clonación con audio y contexto, diseño de voz por descripción, español y salida nativa a 48 kHz. |

La selección sale de la [investigación base](docs/investigacion/investigacion_base_TTS.md). Los parámetros de cada modelo y las mediciones de rendimiento están en [docs/modelos.md](docs/modelos.md).

**Favorito personal de Jhon: Higgs TTS 3 4B 6-bit.** Según las pruebas que realizó con su propia voz, es el modelo que mejor se adapta a ella. Arena lo identifica con **★ Tu favorito**.

Supertonic se añadió tras verificar el modelo original y el archivo oficial de Supertone. Su [guía completa de configuración](docs/supertonic-3.md) incluye los parámetros, idiomas, importación de estilos JSON, etiquetas y pruebas locales. El SDK público no clona una grabación; Voice Builder está cerrado y el código oficial archivado.

VoxCPM2 se añadió al [validar el informe de cinco modelos adicionales](docs/investigacion/validacion-modelos-clonacion-2026-10-10.md). Solo este candidato reúne clonación local completa en el entorno instalado y español documentado. La [guía de VoxCPM2](docs/voxcpm2.md) explica sus controles de clonación, diseño, difusión y segmentación. Voxtral queda pendiente de una ruta experimental con Xcode; Step-Audio-EditX aún lista español como pendiente; Magpie v2607 y Kokoro no clonan.

## Requisitos

- Mac con Apple Silicon y 16 GB de memoria o más.
- Node.js 20 o superior.
- [uv](https://docs.astral.sh/uv/) (`curl -LsSf https://astral.sh/uv/install.sh | sh`).
- ffmpeg (`brew install ffmpeg`).
- ~25 GB libres de disco para los pesos.

## Instalación y uso

```bash
npm run setup     # dependencias Node, cuatro entornos Python y descarga de pesos (~18.7 GB)
npm run check     # verifica que todo esté listo
npm run dev       # abre http://localhost:5178
```

| Script | Qué hace |
|---|---|
| `npm run setup` | Instala todo. Se puede repetir sin problema. |
| `npm run download [-- fish]` | Descarga (o completa) pesos: `chatterbox`, `qwen`, `fish`, `higgs`, `cosyvoice`, `supertonic`, `voxcpm2`, `whisper`, `voices`. |
| `npm run dev` | Servidor con recarga al cambiar `server/`. |
| `npm start` | Servidor sin recarga. Puerto configurable con `PORT=…`. |
| `npm run check` | Comprueba ffmpeg, entornos, pesos y MPS. |
| `npm test` | Verifica configuración, importación de estilos y traducción de etiquetas de Supertonic. |

## La interfaz

- **Arena:** texto, voz de referencia y una columna por modelo con sus parámetros (los avanzados, plegados). Cada columna muestra su audio, tiempo de generación, RTF y memoria pico. La cabecera enciende una luz por el modelo que está en memoria en ese momento.
- **Accesos rápidos:** seis guiones etiquetados que fijan también el tono de Fish, Higgs y CosyVoice3. Las etiquetas se traducen a cada modelo (ver [docs/modelos.md](docs/modelos.md#traducción-de-etiquetas-entre-modelos)).
- **Tomas individuales y ajuste fino:** el botón **Generar solo este** de cada columna genera solo ese modelo con sus ajustes actuales. Las tomas anteriores del mismo texto se conservan en la columna (la más reciente arriba), cada una con su audio y los parámetros que cambiaron frente a la anterior; antes de generar, la columna muestra qué cambiará frente a la última toma. La semilla 0 (aleatoria) se resuelve a un número concreto y queda registrada, así una toma aleatoria que guste se puede reproducir con **Usar estos ajustes**. Se pueden encolar varias tomas seguidas y descartar las que no sirvan. Las tomas individuales no cuentan para el ranking.
- **Ajustes guardados:** cada columna guarda configuraciones con nombre (parámetros + uso de la voz de referencia) en `data/presets.json`, desde los controles actuales o desde una toma (**Guardar como ajuste**). Guardar con un nombre existente lo actualiza.
- **Escucha a ciegas:** baraja los resultados como Modelo A/B/C/D/E/F; al votar se revelan los nombres.
- **Historial:** todas las generaciones, con descarga del WAV y la opción de reutilizar su configuración.
- **Ranking:** victorias por modelo en las comparaciones votadas y RTF medio.
- **Voces:** sube o graba voces de referencia (5–15 s). Al guardar, la voz queda disponible para escucharla y seleccionada en Arena; **Usar en Arena** permite elegir cualquier voz guardada o la demo incluida. Whisper transcribe en segundo plano, sin bloquear el guardado; si falla, puedes escribir la transcripción o reintentarlo. La selección se conserva al recargar la página.

## Cómo funciona

```
Navegador ──HTTP/SSE──▶ Node (Express)
                          │  cola estrictamente secuencial
                          ├─▶ .venvs/torch/bin/python workers/chatterbox_worker.py job.json
                          ├─▶ .venvs/mlx/bin/python   workers/mlx_worker.py       job.json  (Qwen)
                          ├─▶ .venvs/mlx/bin/python   workers/mlx_worker.py       job.json  (Fish)
                          ├─▶ .venvs/mlx/bin/python   workers/mlx_worker.py       job.json  (Higgs)
                          ├─▶ .venvs/cosyvoice/bin/python workers/cosyvoice_worker.py job.json
                          ├─▶ .venvs/mlx/bin/python workers/voxcpm2_worker.py job.json
                          └─▶ .venvs/supertonic/bin/python workers/supertonic_worker.py job.json
```

- Cada modelo corre en **su propio proceso Python**; al terminar, el proceso sale y el sistema operativo recupera toda su memoria. Si detienes el servidor, el proceso en curso se termina también.
- Hay **cuatro entornos Python**: Chatterbox fija `transformers 4.46` y `mlx-audio` exige `≥ 5.14`; `mlx-audio-plus` (CosyVoice3) se instala como el mismo paquete `mlx_audio` que `mlx-audio`. Supertonic usa su SDK oficial y ONNX en CPU, aislado de los tres anteriores.
- Los resultados se guardan en `outputs/runs/<id>/` (WAV + `run.json`); las voces subidas en `data/voices/`; los ajustes guardados en `data/presets.json`.

## Problemas frecuentes

- **"No hay conexión con el servidor"** (antes, "Failed to fetch"): la página está abierta pero el servidor no corre. Arráncalo con `npm run dev`; la página se reconecta sola. Si se detiene a mitad de una generación, esa corrida queda como cancelada.

## Licencias de los modelos

- Chatterbox: MIT (con marca de agua Perth en el audio).
- Qwen3-TTS: Apache-2.0.
- Fish Audio S2 Pro: Fish Audio Research License, **solo uso no comercial** sin un acuerdo con Fish Audio. Built with Fish Audio.
- Higgs TTS 3: Boson Higgs TTS 3 Research and Non-Commercial License. Contenido de creadores monetizable acreditando *"This audio was created with Boson AI's Higgs Audio"*; uso en productos o producción requiere licencia comercial.
- CosyVoice3: Apache-2.0.
- Supertonic 3: pesos OpenRAIL-M con condiciones de uso; SDK y ejemplos MIT.
- VoxCPM2: Apache-2.0.

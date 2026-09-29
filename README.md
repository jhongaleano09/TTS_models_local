# TTS Arena local

Arena para comparar modelos de texto a voz en español latino **100 % en local**, en una Mac con Apple Silicon. Escribes un texto, ajustas los parámetros de cada modelo, pulsas **Generar** y los modelos se ejecutan **uno tras otro**: cada uno se carga, genera su WAV y libera la memoria antes de cargar el siguiente. Probado en una MacBook Air M5 de 16 GB.

| Modelo | Runtime | Por qué está aquí |
|---|---|---|
| **Chatterbox V3 es-MX/LatAm** | PyTorch · MPS | Fine-tune dedicado a español latinoamericano (es-419 / es-MX). |
| **Qwen3-TTS 1.7B Base 4-bit** | MLX | El más rápido; clonación excelente con audio + transcripción. |
| **Fish Audio S2 Pro 4-bit** | MLX | El más expresivo: etiquetas `[whisper]`, `[laughing]`, `[sigh]`… |
| **Higgs TTS 3 4B 6-bit** | MLX | Paralingüística fuerte: tokens `<\|emotion:…\|>`, `<\|sfx:laughter\|>`, pausas. |
| **CosyVoice3 0.5B 4-bit** | MLX (mlx-audio-plus) | El más ligero; clonación zero-shot e instrucciones de estilo. |

La selección sale de la [investigación base](docs/investigacion/investigacion_base_TTS.md). Los parámetros de cada modelo y las mediciones de rendimiento están en [docs/modelos.md](docs/modelos.md).

## Requisitos

- Mac con Apple Silicon y 16 GB de memoria o más.
- Node.js 20 o superior.
- [uv](https://docs.astral.sh/uv/) (`curl -LsSf https://astral.sh/uv/install.sh | sh`).
- ffmpeg (`brew install ffmpeg`).
- ~22 GB libres de disco para los pesos.

## Instalación y uso

```bash
npm run setup     # dependencias Node, tres entornos Python y descarga de pesos (~16 GB)
npm run check     # verifica que todo esté listo
npm run dev       # abre http://localhost:5178
```

| Script | Qué hace |
|---|---|
| `npm run setup` | Instala todo. Se puede repetir sin problema. |
| `npm run download [-- fish]` | Descarga (o completa) pesos: `chatterbox`, `qwen`, `fish`, `higgs`, `cosyvoice`, `whisper`, `voices`. |
| `npm run dev` | Servidor con recarga al cambiar `server/`. |
| `npm start` | Servidor sin recarga. Puerto configurable con `PORT=…`. |
| `npm run check` | Comprueba ffmpeg, entornos, pesos y MPS. |

## La interfaz

- **Arena:** texto, voz de referencia y una columna por modelo con sus parámetros (los avanzados, plegados). Cada columna muestra su audio, tiempo de generación, RTF y memoria pico. La cabecera enciende una luz por el modelo que está en memoria en ese momento.
- **Accesos rápidos:** seis guiones etiquetados que fijan también el tono de Fish, Higgs y CosyVoice3. Las etiquetas se traducen a cada modelo (ver [docs/modelos.md](docs/modelos.md#traducción-de-etiquetas-entre-modelos)).
- **Escucha a ciegas:** baraja los resultados como Modelo A/B/C/D/E; al votar se revelan los nombres.
- **Historial:** todas las generaciones, con descarga del WAV y la opción de reutilizar su configuración.
- **Ranking:** victorias por modelo en las comparaciones votadas y RTF medio.
- **Voces:** sube o graba voces de referencia (5–15 s); Whisper las transcribe automáticamente.

## Cómo funciona

```
Navegador ──HTTP/SSE──▶ Node (Express)
                          │  cola estrictamente secuencial
                          ├─▶ .venvs/torch/bin/python workers/chatterbox_worker.py job.json
                          ├─▶ .venvs/mlx/bin/python   workers/mlx_worker.py       job.json  (Qwen)
                          ├─▶ .venvs/mlx/bin/python   workers/mlx_worker.py       job.json  (Fish)
                          ├─▶ .venvs/mlx/bin/python   workers/mlx_worker.py       job.json  (Higgs)
                          └─▶ .venvs/cosyvoice/bin/python workers/cosyvoice_worker.py job.json
```

- Cada modelo corre en **su propio proceso Python**; al terminar, el proceso sale y el sistema operativo recupera toda su memoria. Si detienes el servidor, el proceso en curso se termina también.
- Hay **tres entornos Python**: Chatterbox fija `transformers 4.46` y `mlx-audio` exige `≥ 5.14`; y `mlx-audio-plus` (CosyVoice3) se instala como el mismo paquete `mlx_audio` que `mlx-audio`.
- Los resultados se guardan en `outputs/runs/<id>/` (WAV + `run.json`); las voces subidas en `data/voices/`.

## Problemas frecuentes

- **"No hay conexión con el servidor"** (antes, "Failed to fetch"): la página está abierta pero el servidor no corre. Arráncalo con `npm run dev`; la página se reconecta sola. Si se detiene a mitad de una generación, esa corrida queda como cancelada.

## Licencias de los modelos

- Chatterbox: MIT (con marca de agua Perth en el audio).
- Qwen3-TTS: Apache-2.0.
- Fish Audio S2 Pro: Fish Audio Research License, **solo uso no comercial** sin un acuerdo con Fish Audio. Built with Fish Audio.
- Higgs TTS 3: Boson Higgs TTS 3 Research and Non-Commercial License. Contenido de creadores monetizable acreditando *"This audio was created with Boson AI's Higgs Audio"*; uso en productos o producción requiere licencia comercial.
- CosyVoice3: Apache-2.0.

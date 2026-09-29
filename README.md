# TTS Arena local

Arena para comparar modelos de texto a voz en español latino **100 % en local**, en una Mac con Apple Silicon. Escribes un texto, ajustas los parámetros de cada modelo, pulsas **Generar** y los modelos se ejecutan **uno tras otro**: cada uno se carga, genera su WAV y libera la memoria antes de cargar el siguiente. Probado en una MacBook Air M5 de 16 GB.

| Modelo | Runtime | Por qué está aquí |
|---|---|---|
| **Chatterbox V3 es-MX/LatAm** | PyTorch · MPS | Fine-tune dedicado a español latinoamericano (es-419 / es-MX). |
| **Qwen3-TTS 1.7B Base 4-bit** | MLX | El más rápido; clonación excelente con audio + transcripción. |
| **Fish Audio S2 Pro 4-bit** | MLX | El más expresivo: etiquetas `[whisper]`, `[laughing]`, `[sigh]`… |

La selección sale de la [investigación base](docs/investigacion/investigacion_base_TTS.md). Los parámetros de cada modelo y las mediciones de rendimiento están en [docs/modelos.md](docs/modelos.md).

## Requisitos

- Mac con Apple Silicon y 16 GB de memoria o más.
- Node.js 20 o superior.
- [uv](https://docs.astral.sh/uv/) (`curl -LsSf https://astral.sh/uv/install.sh | sh`).
- ffmpeg (`brew install ffmpeg`).
- ~15 GB libres de disco para los pesos.

## Instalación y uso

```bash
npm run setup     # dependencias Node, dos entornos Python y descarga de pesos (~11 GB)
npm run check     # verifica que todo esté listo
npm run dev       # abre http://localhost:5178
```

| Script | Qué hace |
|---|---|
| `npm run setup` | Instala todo. Se puede repetir sin problema. |
| `npm run download [-- fish]` | Descarga (o completa) pesos: `chatterbox`, `qwen`, `fish`, `whisper`, `voices`. |
| `npm run dev` | Servidor con recarga al cambiar `server/`. |
| `npm start` | Servidor sin recarga. Puerto configurable con `PORT=…`. |
| `npm run check` | Comprueba ffmpeg, entornos, pesos y MPS. |

## La interfaz

- **Arena:** texto, voz de referencia y una columna por modelo con sus parámetros (los avanzados, plegados). Cada columna muestra su audio, tiempo de generación, RTF y memoria pico. La cabecera enciende una luz por el modelo que está en memoria en ese momento.
- **Escucha a ciegas:** baraja los resultados como Modelo A/B/C; al votar se revelan los nombres.
- **Historial:** todas las generaciones, con descarga del WAV y la opción de reutilizar su configuración.
- **Ranking:** victorias por modelo en las comparaciones votadas y RTF medio.
- **Voces:** sube o graba voces de referencia (5–15 s); Whisper las transcribe automáticamente.

## Cómo funciona

```
Navegador ──HTTP/SSE──▶ Node (Express)
                          │  cola estrictamente secuencial
                          ├─▶ .venvs/torch/bin/python workers/chatterbox_worker.py job.json
                          ├─▶ .venvs/mlx/bin/python   workers/mlx_worker.py       job.json  (Qwen)
                          └─▶ .venvs/mlx/bin/python   workers/mlx_worker.py       job.json  (Fish)
```

- Cada modelo corre en **su propio proceso Python**; al terminar, el proceso sale y el sistema operativo recupera toda su memoria. Si detienes el servidor, el proceso en curso se termina también.
- Hay **dos entornos Python** porque Chatterbox fija `transformers 4.46` y `mlx-audio` exige `≥ 5.14`.
- Los resultados se guardan en `outputs/runs/<id>/` (WAV + `run.json`); las voces subidas en `data/voices/`.

## Licencias de los modelos

- Chatterbox: MIT (con marca de agua Perth en el audio).
- Qwen3-TTS: Apache-2.0.
- Fish Audio S2 Pro: Fish Audio Research License, **solo uso no comercial** sin un acuerdo con Fish Audio. Built with Fish Audio.

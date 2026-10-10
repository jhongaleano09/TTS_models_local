# Localización y validación del laboratorio TTS

Validado el **9 de octubre de 2026**, zona horaria America/Bogota.

## Proyecto recuperado

- Nombre: **TTS Arena Local**.
- Directorio existente: `/Users/jhon/Documents/projects/TTS_models_local`.
- Repositorio: https://github.com/jhongaleano09/TTS_models_local
- Rama: `main`.
- Código al iniciar la revisión: `253e44de3e51f19f51e1e62238f6593868698c73`, del 28 de septiembre de 2026.
- La rama remota consultada coincidía con ese commit y el árbol de trabajo estaba limpio.

El laboratorio ya es un proyecto independiente con Git, README, interfaz, servidor, workers, scripts, documentación y entornos instalados. Se conserva su directorio original para reutilizar las instalaciones, los enlaces a pesos y los audios anteriores.

## Evidencia de funcionamiento

| Comprobación | Resultado |
|---|---|
| `npm run check` | Finalizó con código 0; ffmpeg, ffprobe, tres entornos Python y aceleración MPS disponibles. |
| Catálogo | Chatterbox V3 es-MX/LatAm, Qwen3-TTS, Fish S2 Pro, Higgs TTS 3 y CosyVoice3. |
| Historial anterior | 12 corridas con 32 resultados completados y 32 archivos WAV: 9 Chatterbox, 9 Qwen, 10 Fish, 3 Higgs y 1 CosyVoice. |
| Interfaz y API | HTTP 200 en `/`, `/api/models`, `/api/runs` y `/api/system`. |
| Generación nueva | Qwen, semilla 42, voz de demostración es-MX y texto breve; terminó en estado `done`. |
| Audio nuevo | WAV de 4,88 s, 24 kHz, servido correctamente por HTTP y reconocido por ffprobe. |

La prueba nueva corresponde a `2026-10-10T00-49-44-883Z_83fa50`: el identificador usa UTC, aunque la fecha local de validación es el 9 de octubre. El resultado queda en `outputs/runs/<id>/qwen.wav`.

Métricas reportadas por el worker: 2,95 s de carga, 5,30 s de generación y 6,77 GB de memoria pico. Se probó generación nueva solo con Qwen; los otros cuatro modelos tienen evidencia de ejecución anterior. La comprobación de disponibilidad del proyecto no constituye una prueba de inferencia completa para todos los modelos.

## Docker

No se encontraron Dockerfile ni archivos Compose en este proyecto, ni archivos con nombres Docker/Compose en su historial Git local disponible. Tampoco se identificaron contenedores, imágenes o volúmenes por nombre asociados a este laboratorio en el contexto Docker activo `desktop-linux`.

Esta versión ejecuta Node.js y procesos Python directamente en macOS; usa PyTorch/MPS y MLX. Los pesos están en la caché local de Hugging Face y Fish tiene enlaces desde `models/` a esa caché.

La búsqueda adicional en Documents, Desktop y Downloads no localizó otra copia del laboratorio por los nombres TTS, Kokoro, XTTS, Coqui o Piper. Esto no descarta un despliegue anterior eliminado, ubicado en otra máquina o bajo un nombre diferente.

## Retomar el trabajo

Desde `/Users/jhon/Documents/projects/TTS_models_local`:

```bash
npm run check
npm run dev
```

Interfaz: http://localhost:5178. Para detener el servidor iniciado desde una terminal, usar Ctrl+C. No hace falta reinstalar dependencias ni descargar pesos para la prueba verificada.

Las generaciones siguen una cola secuencial: mantener un solo modelo en ejecución a la vez. Los datos, entornos, pesos y resultados permanecen excluidos de Git según `.gitignore`.

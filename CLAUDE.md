# TTS Arena Local — reglas del proyecto

## Regla obligatoria: push tras cada ajuste

Cada vez que se haga un ajuste al proyecto (código, docs, configuración), al terminarlo:

1. `git add` de los archivos modificados (nunca `.venvs/`, `models/`, `outputs/` ni pesos).
2. `git commit` con un mensaje en español que describa el cambio.
3. `git push origin main` a https://github.com/jhongaleano09/TTS_models_local.git

No se acumulan cambios sin publicar entre ajustes. Si el push falla, se reporta el error; no se usa `--force`.

## Contexto

- Arena local de modelos TTS para MacBook Air M5 16 GB. Investigación base: `docs/investigacion/investigacion_base_TTS.md`.
- Modelos: Chatterbox V3 es-MX/LatAm (PyTorch/MPS), Qwen3-TTS 1.7B Base 4-bit, Fish S2 Pro 4-bit y Higgs TTS 3 6-bit (MLX vía `mlx-audio`), y CosyVoice3 0.5B 4-bit (MLX vía `mlx-audio-plus`).
- Procesamiento **secuencial**: un proceso Python por modelo; al salir se libera la memoria antes de cargar el siguiente. Nunca correr dos modelos en paralelo.
- Tres venvs aislados (`.venvs/torch`, `.venvs/mlx`, `.venvs/cosyvoice`): `chatterbox` y `mlx-audio` exigen versiones incompatibles de `transformers`, y `mlx-audio-plus` se instala como el mismo paquete `mlx_audio`.
- Los guiones usan etiquetas de Fish; `server/tags.js` las traduce a Higgs y CosyVoice3 y las elimina para Chatterbox y Qwen.
- El catálogo de modelos y sus parámetros vive en `server/models.js` (fuente única para UI y workers).
- Documentación de parámetros por modelo: `docs/modelos.md`.

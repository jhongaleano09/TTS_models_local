# TTS Arena Local — reglas del proyecto

## Regla obligatoria: push tras cada ajuste

Cada vez que se haga un ajuste al proyecto (código, docs, configuración), al terminarlo:

1. `git add` de los archivos modificados (nunca `.venvs/`, `models/`, `outputs/` ni pesos).
2. `git commit` con un mensaje en español que describa el cambio.
3. `git push origin main` a https://github.com/jhongaleano09/TTS_models_local.git

No se acumulan cambios sin publicar entre ajustes. Si el push falla, se reporta el error; no se usa `--force`.

## Contexto

- Arena local de modelos TTS para MacBook Air M5 16 GB. Investigación base: `docs/investigacion/investigacion_base_TTS.md`.
- Modelos: Chatterbox V3 es-MX/LatAm (PyTorch/MPS), Qwen3-TTS 1.7B Base 4-bit, Fish S2 Pro 4-bit, Higgs TTS 3 6-bit y VoxCPM2 2B 4-bit (MLX vía `mlx-audio`), CosyVoice3 0.5B 4-bit (MLX vía `mlx-audio-plus`) y Supertonic 3 (ONNX CPU vía SDK oficial 1.3.1).
- Procesamiento **secuencial**: un proceso Python por modelo; al salir se libera la memoria antes de cargar el siguiente. Nunca correr dos modelos en paralelo.
- Cuatro venvs aislados (`.venvs/torch`, `.venvs/mlx`, `.venvs/cosyvoice`, `.venvs/supertonic`): `chatterbox` y `mlx-audio` exigen versiones incompatibles de `transformers`, y `mlx-audio-plus` se instala como el mismo paquete `mlx_audio`; ONNX y Supertonic tienen su propio entorno.
- Los guiones usan etiquetas de Fish; `server/tags.js` las traduce a Higgs, CosyVoice3 y los sonidos documentados de Supertonic, y las elimina para Chatterbox, Qwen y VoxCPM2.
- El catálogo de modelos y sus parámetros vive en `server/models.js` (fuente única para UI y workers).
- Documentación de parámetros por modelo: `docs/modelos.md`.
- Supertonic: `docs/supertonic-3.md`. Pesos fijados del archivo oficial en `models/supertonic-3`, sin descarga durante inferencia. No admite clonación WAV local: usa voces integradas o estilos JSON existentes.
- VoxCPM2: `docs/voxcpm2.md`; usa `workers/voxcpm2_worker.py` en el entorno MLX existente y pesos fijados en `models/voxcpm2-4bit`, sin red durante inferencia. En mlx-audio 0.5.7 la transcripción se consume mediante `prompt_text` + `prompt_audio`, no `ref_text`. No presentar Voxtral como clonador WAV en mlx-audio: su puerto solo usa presets; la alternativa Swift experimental requiere otra integración con Xcode. Validación: `docs/investigacion/validacion-modelos-clonacion-2026-10-10.md`.

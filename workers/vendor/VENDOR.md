# Código vendorizado

## `chatterbox/`

Copiado de `chatterbox/src/chatterbox/` del Space oficial
[ResembleAI/Chatterbox-Multilingual-TTS-es-mx-latam](https://huggingface.co/spaces/ResembleAI/Chatterbox-Multilingual-TTS-es-mx-latam)
(licencia MIT, Resemble AI). Es la implementación V3 que carga el checkpoint
`t3_es_mx_latam.safetensors` + `s3gen_v3.pt`; el paquete `chatterbox-tts` de PyPI
todavía no la incluye.

Cambio local: `ChatterboxTTS.generate()` en `tts.py` acepta y reenvía `top_p`,
`min_p`, `repetition_penalty` y `max_new_tokens` a `T3.inference()`
(los valores por defecto son los mismos del original).

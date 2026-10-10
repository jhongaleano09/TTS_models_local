# Validación del informe adicional: clonación local en español

Fecha: 10 de octubre de 2026. Equipo: Apple M5, 16 GB de memoria unificada.

Se revisó el informe adjunto contra las fichas oficiales y el código de los runtimes. El criterio para incorporarlo al laboratorio es que una grabación propia pueda convertirse en una voz local, con español documentado y una implementación ejecutable en este equipo. El tamaño de los pesos por sí solo no demuestra que el pipeline de clonación funcione.

| Candidato | Decisión | Evidencia y corrección |
|---|---|---|
| **VoxCPM2** | **Incorporado, MLX 4-bit** | [OpenBMB](https://huggingface.co/openbmb/VoxCPM2) documenta español, clonación y diseño de voz. La [conversión de MLX Community](https://huggingface.co/mlx-community/VoxCPM2-4bit) incluye VAE y modelos de difusión, además del LM cuantizado. Generación real comprobada en esta Mac. |
| **Voxtral TTS** | Pendiente, no se incorpora como clonador listo | Mistral ofrece clonación en su producto, pero sus pesos públicos no incluyen el encoder que crea embeddings desde WAV. El [puerto de mlx-audio](https://github.com/Blaizzy/mlx-audio/blob/main/mlx_audio/tts/models/voxtral_tts/voxtral_tts.py), tanto 0.5.7 instalado como main revisado, solo condiciona por un preset: `generate` no consume `ref_audio`. Pasarle ese argumento por `**kwargs` daría la falsa impresión de clonar. Existe una [alternativa Swift](https://github.com/VincentGourbin/mlx-voxtral-swift/blob/main/docs/voice_cloning.md) que optimiza códigos con el decoder congelado; es un workaround experimental con miles de iteraciones, distinto de la clonación zero-shot de 2–3 s anunciada. Requiere Xcode para su ruta de compilación documentada; este equipo solo tiene Command Line Tools. No se instala ni se valida esa alternativa en esta entrega. |
| **Step-Audio-EditX** | Excluido por español pendiente | La [ficha oficial en Markdown](https://huggingface.co/stepfun-ai/Step-Audio-EditX/raw/main/README.md) coloca «Arabic, French, Russian, Spanish» en un checkbox **sin marcar** de Feature Support Plan. El informe interpretó la lista como idiomas disponibles. Sí clona, pero no satisface la evidencia de español. Su ruta oficial exige CUDA/Linux; la conversión comunitaria MLX no prueba que añada entrenamiento en español. |
| **Magpie v2607** | Excluido por no clonar | [NVIDIA](https://huggingface.co/nvidia/magpie_tts_multilingual_357m) declara que esta versión retiró zero-shot voice cloning. Las métricas de zero-shot de otras evaluaciones no habilitan una función retirada del checkpoint actual. |
| **Kokoro-82M** | Excluido por voces fijas | La [ficha del creador](https://huggingface.co/hexgrad/Kokoro-82M) y su catálogo describen voces predefinidas. Mezclar estilos/voces no equivale a clonar una grabación propia. |

El ranking Elo del informe no se reutiliza como una medición de calidad en español ni como evidencia de clonación local. No se verificaron todas sus cifras de Arena: no deciden esta integración. Tampoco se promete acento es-LatAm por enumerar español: se debe escuchar la referencia y el resultado.

Supertonic 3 ya existía en el laboratorio; conserva su catálogo e historial. Esta ampliación agrega únicamente un modelo que permite crear/clonar voces, sin eliminar los modelos anteriores.

## Implementación y pruebas

- VoxCPM2: revisión `dc9e5c187858da5f4a13dc4c247e297339216381`, pesos locales en `models/voxcpm2-4bit`, manifiesto de descarga con tamaños; tokenizer e inferencia sin red.
- Runtime existente `mlx-audio==0.5.7`, sin cambiar versiones de los modelos anteriores ni crear entornos incompatibles.
- Clonación automática: audio + transcripción → combinado; audio sin texto → solo timbre. Los modos explícitos de continuación y combinado requieren una transcripción antes de encolar.
- Corrección de API: en este runtime `ref_text` no es utilizado por VoxCPM2. La transcripción se envía como `prompt_text` junto con `prompt_audio`, evitando ignorarla silenciosamente.
- Controles independientes de estilo, CFG, difusión, segmentación, pausas, mínimo/máximo de pasos y semilla, disponibles en Estudio y ajustes guardados.
- Generación secuencial; conserva la referencia entre fragmentos. Sin referencia, el primer fragmento sirve como referencia de los siguientes.
- Primera clonación real: voz guardada `Jhon_test_local_espanol`, semilla 42, modo combinado, texto «Hola, esta es una prueba de clonación de voz en español desde el laboratorio local.» Carga 1.05 s, generación 8.89 s, audio 4.32 s, 48 kHz, memoria pico MLX 4.52 GB. Whisper local recuperó el texto completo. Esto confirma el flujo y la inteligibilidad; la similitud y el acento requieren escucha humana.
- Diseño sin referencia, dos fragmentos: carga 0.76 s, generación 9.05 s, audio 6.20 s, memoria pico MLX 4.41 GB. Descripción: «Voz masculina cálida, acento colombiano, narración tranquila.» Whisper recuperó íntegramente el guion de ambos fragmentos.
- Prueba real desde el navegador, solo timbre con 7 pasos: generación 4.89 s, audio 3.20 s, pico 4.41 GB. Whisper detectó la omisión del «Hola» inicial. La generación funciona, pero ese ajuste no igualó la integridad del combinado con 10 pasos. Se documenta la diferencia y se conserva Automático/10 como configuración inicial.
- Segunda toma desde la interfaz: Automático/10 con transcripción, generación 7.96 s, audio 4.32 s, pico 4.52 GB. El WAV es idéntico byte a byte a la primera clonación con semilla 42, cuyo guion se verificó completo con Whisper. El selector, parámetros, voz y guion persistieron al recargar; la mesa mostró los cambios entre tomas y permitió descargar el WAV.
- 11 pruebas automatizadas del workspace pasaron, incluida la biblioteca preexistente. También se comprobó por separado la versión preparada para publicación, sin incluir los cambios previos de interfaz que seguían sin commit (6 pruebas disponibles en esa versión). `npm run check` confirmó entornos, pesos y runtime.

Guía de uso y límites: [VoxCPM2](../voxcpm2.md).

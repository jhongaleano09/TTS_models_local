# Supertonic 3: configuración y validación local

Validado el **9 de octubre de 2026**, America/Bogota, en la MacBook Air Apple M5 de 16 GB. Es el sexto modelo de la Arena; comparte generación individual, comparación a ciegas, historial, ranking, ajustes guardados y la cola estrictamente secuencial.

## Procedencia y estado

- Desarrollador: **Supertone**. Modelo original: [Supertone/supertonic-3](https://huggingface.co/Supertone/supertonic-3).
- Descarga utilizada: [archivo oficial supertone-oss-archive/supertonic-3](https://huggingface.co/supertone-oss-archive/supertonic-3/tree/aafc6e32416a594460b32413efc49d7fe4ce6d46), revisión `aafc6e32416a594460b32413efc49d7fe4ce6d46`, recomendada por la [guía del archivo oficial](https://github.com/supertone-oss-archive/supertonic#quick-start).
- Aproximadamente **99 millones de parámetros** y **401,3 MB** de archivos instalados, sin ejemplos multimedia.
- SDK oficial [`supertonic==1.3.1`](https://pypi.org/project/supertonic/1.3.1/); `onnxruntime==1.24.4`; Python 3.11. Entorno aislado `.venvs/supertonic`.
- El [SDK está archivado](https://github.com/supertone-oss-archive/supertonic-py); no recibe mantenimiento ni soporte oficial. La [notificación histórica de Supertone](https://github.com/supertone-oss-archive/supertonic#previous-service-notice--july-23-2026) indica que Voice Builder dejó de estar disponible después del 31 de agosto de 2026.

La ficha original todavía enlaza servicios históricos. Esta integración utiliza el archivo de pesos y archivos JSON existentes; no requiere esos servicios. El `config.json` de Hugging Face es un marcador de conteo de descargas: la configuración real está en `onnx/tts.json`.

## Instalación

Para una instalación nueva, `npm run setup` crea los cuatro entornos y descarga todos los modelos. Para añadir únicamente Supertonic a una instalación existente:

```bash
uv venv --allow-existing --python 3.11 .venvs/supertonic
uv pip install --python .venvs/supertonic/bin/python -r workers/requirements-supertonic.txt
npm run download -- supertonic
npm run check
npm test
npm run dev
```

El descargador también puede ejecutarse con `.venvs/supertonic/bin/python scripts/download_models.py supertonic`. Los archivos quedan en `models/supertonic-3/`, con cuatro redes ONNX, `tts.json`, `unicode_indexer.json`, diez estilos de voz, licencia y un manifiesto de procedencia. La comprobación de disponibilidad exige archivos no vacíos y la revisión esperada. Si una descarga se interrumpe, repite el comando.

El worker abre explícitamente esa carpeta con `model="supertonic-3"` y `auto_download=False`. Tras instalar dependencias y pesos, la síntesis es local y no accede a Hugging Face. La salida del Arena es **WAV mono PCM de 16 bits a 44.100 Hz**. La frecuencia de muestreo la define el modelo, no un control de la interfaz.

## Todos los controles expuestos

Los controles salen de `server/models.js`. Se validan antes de encolar una toma o guardar un ajuste; valores desconocidos, fuera de rango o de tipo incorrecto devuelven HTTP 400.

| Control / clave | Valores de la Arena | Defecto | Uso |
|---|---|---|---|
| Voz integrada / `voice_name` | M1–M5, F1–F5 | M1 | Cinco voces masculinas y cinco femeninas. No determina el idioma. |
| Idioma / `lang` | 31 códigos ISO y `na` | es | Español general. No existe un código propio para es-MX/es-419 en este modelo. `na` evita fijar un idioma; no ejecuta detección automática. |
| Pasos / `total_steps` | Entero 1–100 | 8 | Rango del SDK. La documentación propone 5–12 como intervalo práctico de calidad. Más pasos aumentan el coste; no garantizan mayor calidad. |
| Velocidad / `speed` | 0,7–2,0 | 1,05 | Control nativo de duración. Menor = más lento. No es el estiramiento de audio posterior utilizado por otros modelos. |
| Estilo personalizado / `custom_style_path` | JSON importado o ruta local; vacío | vacío | Tiene prioridad sobre `voice_name`. Puedes volver a la voz integrada con el botón correspondiente. |
| Fragmentación / `max_chunk_length` | 0 o entero 10–3000 | 0 | 0 se convierte en `None`: el SDK usa 120 caracteres para coreano y 300 para los demás idiomas. Agrupa por párrafos y oraciones; una oración puede superar el objetivo. |
| Silencio / `silence_duration` | 0–10 segundos | 0,3 | Entre fragmentos; nunca al final. El SDK solo exige un valor no negativo; 10 s es el límite práctico de la Arena. |
| Hilos internos / `intra_op_num_threads` | Entero 0–64 | 0 | 0 deja que ONNX decida. Un valor explícito controla paralelismo dentro de una operación. 64 es límite de la Arena. |
| Hilos entre operaciones / `inter_op_num_threads` | Entero 0–64 | 0 | Se transmite al SDK, pero este utiliza `ORT_SEQUENTIAL`, por lo que puede no alterar el rendimiento. |
| Registro / `verbose` | sí/no | no | Muestra fragmentos y tiempos del SDK en el registro de la toma. |
| Semilla / `seed` | Entero 0–2147483647 | 0 | 0 se resuelve en el servidor a una semilla concreta y se guarda como `seedUsed`. Se aplica a NumPy, fuente del ruido del modelo. |

Los hilos con valor 0 se pasan explícitamente a ONNX, para que las variables `SUPERTONIC_INTRA_OP_THREADS` / `SUPERTONIC_INTER_OP_THREADS` del equipo no sustituyan el ajuste visible. La reproducibilidad se comprobó con la misma versión, hardware, parámetros y cuatro hilos; cambiar runtime, hardware o paralelismo puede afectar la igualdad exacta.

El proveedor utilizado por el SDK oficial es **CPUExecutionProvider**. Aunque la instalación de ONNX anuncie CoreML, esta integración no ofrece un selector de GPU/MPS/CoreML: el constructor oficial de `TTS` no expone proveedores. No se carga PyTorch ni MLX para Supertonic.

## Idiomas

| Código | Idioma | Código | Idioma | Código | Idioma |
|---|---|---|---|---|---|
| ar | Árabe | bg | Búlgaro | cs | Checo |
| da | Danés | de | Alemán | el | Griego |
| en | Inglés | es | Español | et | Estonio |
| fi | Finés | fr | Francés | hi | Hindi |
| hr | Croata | hu | Húngaro | id | Indonesio |
| it | Italiano | ja | Japonés | ko | Coreano |
| lt | Lituano | lv | Letón | nl | Neerlandés |
| pl | Polaco | pt | Portugués | ro | Rumano |
| ru | Ruso | sk | Eslovaco | sl | Esloveno |
| sv | Sueco | tr | Turco | uk | Ucraniano |
| vi | Vietnamita | na | Sin idioma fijado | | |

## Voces personalizadas

Selecciona **Importar estilo de voz JSON** en la columna. La Arena valida los embeddings y guarda una copia en `data/supertonic-styles/<uuid>.json`; la ruta queda asociada a la configuración, las tomas y los ajustes guardados. Para volver a M1–M5/F1–F5 pulsa **Usar voz integrada**. También puedes introducir una ruta absoluta, una ruta con `~` o una ruta relativa a la raíz del proyecto.

El JSON debe contener `style_ttl` con dimensiones `[1,50,256]` y `style_dp` con dimensiones `[1,8,16]`, ambos con datos numéricos finitos completos. Los metadatos adicionales se conservan. La validación del formato no demuestra que un embedding de otro modelo sea semánticamente compatible: utiliza estilos creados específicamente para Supertonic 3.

El SDK abierto **no contiene un encoder para convertir un WAV en embeddings de voz**. La voz grabada/subida en la pestaña Voces y su transcripción no se envían a Supertonic; su interruptor de audio de referencia está oculto y el servidor fuerza `useReference=false`. Los antiguos estilos exportados de Voice Builder pueden reutilizarse, pero crear un estilo nuevo con ese servicio ya no es una opción disponible. La prueba de importación utilizó F1 del checkpoint oficial; no demuestra clonación nueva de una persona.

## Expresión y textos largos

La documentación anuncia diez etiquetas expresivas, pero la ficha y el README consultados solo explicitan **`<laugh>`, `<breath>` y `<sigh>`**. La integración traduce esos sonidos documentados sin inventar un catálogo de las otras siete etiquetas.

| Texto común | Supertonic 3 |
|---|---|
| `[laughing]`, `[laugh]`, `[laughter]`, `[chuckle]` | `<laugh>` |
| `[inhale]`, `[exhale]`, `[breath]` | `<breath>` |
| `[sigh]` | `<sigh>` |
| `[pause]`, `[short pause]`, emociones, volumen, instrucciones entre corchetes | Se eliminan; no se sustituyen por respiraciones. |

Las tres etiquetas nativas se conservan para Supertonic y se eliminan para los otros cinco modelos. Tokens de hablante de Fish, emociones de Higgs y spans de CosyVoice se eliminan antes de enviar el texto a Supertonic. Ejemplo:

```text
Hola, bienvenidos a la prueba. [laughing] Qué gusto escucharles.
[sigh] Vamos a continuar. [inhale] La síntesis ocurre en este computador.
```

El SDK conserva la misma voz al concatenar fragmentos. El Arena mantiene su límite global de 3000 caracteres; aunque el SDK permita más texto, esta integración conserva ese límite. No existen temperatura, top-k, top-p, CFG, instrucciones libres de estilo ni diálogo multihablante en la API de síntesis de este SDK. La expresividad también depende de la puntuación y de la voz elegida.

## Configuraciones iniciales sugeridas

Estas son propuestas para experimentar, no presets oficiales ni garantías de acento latino:

| Objetivo | Configuración |
|---|---|
| Comparación inicial | es, M1 o F1, 8 pasos, velocidad 1,05, fragmentación automática, silencio 0,3 s. |
| Narración pausada | es, voz elegida tras escucharla, 10 pasos, velocidad 0,9, silencio 0,4 s. |
| Iteración rápida | es, 5 pasos, velocidad 1,05, 2–4 hilos internos; compara calidad con 8 pasos. |
| Repetir una toma | Usa **Usar estos ajustes**: recupera la semilla concreta y el estilo de la toma. |

## Otras capacidades oficiales y alcance de la integración

El SDK también ofrece CLI, síntesis por lotes y un servidor HTTP opcional con `/v1/tts` y `/v1/audio/speech`, más exportación WAV/FLAC/OGG en ese servidor. El código oficial incluye ejemplos para navegador/WebGPU, Node, Swift/iOS, C/C++, C#, Java, Go, Rust y Flutter. Estos son otros puntos de integración del proyecto original, no controles acústicos adicionales del Arena.

La Arena llama al SDK Python dentro de un proceso por toma, conserva WAV y ejecuta modelos uno tras otro. No instala el servidor HTTP opcional ni añade una segunda cola, reproducción en streaming o exportaciones alternativas. API de la Arena para una toma:

```json
{
  "text": "Hola, esta voz se genera en mi computador.",
  "mode": "single",
  "models": [{
    "id": "supertonic",
    "useReference": false,
    "params": {"voice_name": "F1", "lang": "es", "total_steps": 8, "speed": 1.05, "seed": 42}
  }]
}
```

Enviar con `POST /api/runs`. Importar un estilo: `POST /api/supertonic/styles` con `{"style": <contenido JSON>}`; devuelve la ruta local que debe ir en `custom_style_path`.

## Evidencia de funcionamiento

Tres inferencias consecutivas mediante la API real en Apple M5, CPU, 9 de octubre de 2026:

| Toma | Configuración | Carga | Generación | Audio | RTF | Memoria pico RSS |
|---|---|---:|---:|---:|---:|---:|
| M1, primera | es, 8 pasos, 1,05×, semilla 42, 4 hilos | 0,23 s | 1,11 s | 6,97 s | 0,159 | 0,59 GB |
| M1, repetida | Configuración idéntica | 0,21 s | 1,57 s | 6,97 s | 0,226 | 0,59 GB |
| F1 importada | es, 5 pasos, 1,2×, semilla 123, 2 hilos, objetivo 65 caracteres y silencio 0,15 s | 0,23 s | 0,90 s | 8,72 s | 0,103 | 0,58 GB |

Los dos primeros WAV fueron **idénticos byte a byte**. La tercera toma produjo dos fragmentos, usó JSON importado y recibió las tres expresiones traducidas. Se comprobaron HTTP 400 para parámetros/estilos inválidos, persistencia de estilo en presets y exclusión del audio de referencia. Todos los WAV tienen 44.100 Hz; la inferencia correcta no equivale a una evaluación perceptual de calidad ni acredita un acento regional.

Una cuarta prueba en el servidor principal, con los valores por defecto y semilla 42, produjo 5,43 s de audio en 1,03 s, con 0,31 s de carga y RSS pico de 0,58 GB (`2026-10-10T01-07-42-071Z_73d6cf`). Se verificó además la importación de F1 mediante el selector de archivo del navegador y el retorno a una voz integrada. La interfaz mostró las seis columnas sin desbordamiento horizontal en una vista de 417 px.

Identificadores UTC de las tomas: `2026-10-10T01-03-22-122Z_8c5605`, `2026-10-10T01-03-25-145Z_f9976e` y `2026-10-10T01-03-27-159Z_1ddee1`. Permanecen en el historial local, bajo `outputs/runs/` (excluido de Git). Los tiempos se refieren a estos textos breves y no son directamente comparables con pruebas anteriores de otros modelos con clonación o guiones distintos.

## Licencia y resolución de problemas

Código: MIT. Pesos: [BigScience OpenRAIL-M](https://huggingface.co/supertone-oss-archive/supertonic-3/blob/aafc6e32416a594460b32413efc49d7fe4ce6d46/LICENSE), con sus condiciones de uso y redistribución. No se etiqueta el modelo como Apache/MIT ni como una licencia solo de investigación.

- **Faltan pesos o revisión:** `npm run download -- supertonic`.
- **Faltan dependencias:** instala `workers/requirements-supertonic.txt` en `.venvs/supertonic` y ejecuta `npm run check`.
- **Estilo inválido:** comprueba ambos embeddings, sus dimensiones y que corresponda a Supertonic 3. Vuelve a una voz integrada para aislar el problema.
- **Idioma no admitido:** usa uno de los códigos de la tabla o `na`. `spanish`, `auto` y `es-MX` no son códigos del SDK.
- **Mucho silencio:** baja `silence_duration` y revisa la separación en párrafos.
- **Generación lenta:** compara 2–4 hilos frente a automático y baja de 12 a 8/5 pasos; mide con el mismo texto.
- **La grabación no modifica la voz:** es el comportamiento esperado del SDK público; utiliza un estilo JSON existente.

Fuentes adicionales de parámetros: [constructor y síntesis del SDK](https://github.com/supertone-oss-archive/supertonic-py/blob/main/supertonic/pipeline.py), [constantes y rangos](https://github.com/supertone-oss-archive/supertonic-py/blob/main/supertonic/config.py), [sesiones ONNX y carga de estilos](https://github.com/supertone-oss-archive/supertonic-py/blob/main/supertonic/loader.py), [guía de uso del SDK](https://github.com/supertone-oss-archive/supertonic-py/blob/main/docs/quickstart.md).

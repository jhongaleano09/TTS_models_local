# VoxCPM2 2B 4-bit

Modelo de OpenBMB para **clonación de grabaciones propias y diseño de voz por descripción**, con español entre sus 30 idiomas y salida nativa mono a 48 kHz. Usa la conversión de MLX Community en el entorno MLX existente, con revisión fijada. Pesos ≈2.30 GB; memoria pico medida en las pruebas cortas: 4.41–4.52 GB.

## Uso en el estudio

1. Selecciona **VoxCPM2 2B 4-bit**.
2. Escribe el guion en español y elige una voz guardada o graba/sube una referencia limpia de un solo hablante.
3. Usa **Automático** para empezar: con transcripción exacta combina timbre y contexto; sin ella clona solo el timbre. Corrige la transcripción en Voces si Whisper no coincide con lo grabado.
4. Ajusta **Descripción de voz / estilo**, CFG, difusión y semilla; genera y escucha. Guarda el resultado que te guste como un ajuste de este modelo.
5. Para crear una voz desde cero, desactiva **Usar voz de referencia** o elige **Sin referencia**. Describe la voz deseada. En un guion largo, el primer fragmento pasa a ser la referencia de los siguientes.

No hay selector de idioma: el texto determina la lengua. Tampoco se exponen temperatura, top-p ni velocidad como si fueran controles del modelo: esta implementación genera por difusión y no los utiliza. El acento colombiano/mexicano debe verificarse por oído.

En una prueba de **solo timbre** con 7 pasos y semilla 42, el audio omitió la palabra inicial «Hola»; el modo **combinado** con 10 pasos recuperó la frase completa. Es una limitación de calidad observada, no un fallo de carga. Para empezar usa Automático, transcripción exacta y 10 pasos. Compara varias tomas y comprueba el inicio y el final del guion antes de reutilizarlo.

## Parámetros

| Control | Valores | Inicial | Efecto |
|---|---|---|---|
| Modo de clonación | Automático / Solo timbre / Continuación / Combinado | Automático | Solo timbre usa `ref_audio`; continuación usa `prompt_audio` + `prompt_text`; combinado usa ambos condicionamientos. Sin referencia genera una voz nueva. |
| Descripción de voz / estilo | Texto, hasta 500 caracteres | Vacío | Se antepone como instrucción entre paréntesis a cada fragmento. Sin referencia diseña voz; con referencia controla entrega y puede modificar el timbre. |
| CFG | 2–5 | 2 | Intensidad de condicionamiento. Empieza en 2; demasiado alto puede afectar naturalidad. |
| Pasos de difusión | 1–50, entero | 10 | Más pasos requieren más tiempo. Prueba 7–10 como punto de partida. |
| Caracteres por fragmento | 80–600, entero | 300 | Divide en oraciones para limitar memoria. Repite el mismo condicionamiento por fragmento. |
| Pausa entre fragmentos | 0–1 s | 0.12 s | Silencio insertado entre los audios generados. |
| Máximo de pasos de audio | 128–2048, entero | 512 | Límite por fragmento (6.25 pasos/s). Un límite pequeño puede cortar el guion; este valor no es una duración objetivo. |
| Mínimo de pasos de audio | 1–64, entero | 2 | Retrasa la posibilidad de detener la generación. |
| Pasos de preparación | 0–8, entero | 0 | Contexto descartado del WAV al generar sin continuación. El runtime lo anula cuando hay continuación. |
| Semilla | 0–2147483647 | 0 | El servidor resuelve 0 a una semilla concreta y la guarda con la toma. |

Los rangos son límites conservadores del laboratorio; los nombres y valores iniciales de inferencia corresponden a `mlx-audio 0.5.7`. No implican calidad óptima en todo el rango.

## Instalación reproducible

```bash
npm run download -- voxcpm2
npm run check
```

Una instalación completa con `npm run setup` también lo incluye. Los pesos, tokenizer y manifiesto están en `models/voxcpm2-4bit`. Una descarga incompleta o una revisión diferente impiden que aparezca listo. El worker no descarga durante una generación. Cada toma corre en un proceso y libera su memoria al salir.

Licencia Apache-2.0. Fuentes: [OpenBMB](https://huggingface.co/openbmb/VoxCPM2), [conversión MLX](https://huggingface.co/mlx-community/VoxCPM2-4bit), [código del runtime](https://github.com/Blaizzy/mlx-audio/blob/main/mlx_audio/tts/models/voxcpm2/voxcpm2.py). Véase la [validación del informe](investigacion/validacion-modelos-clonacion-2026-10-10.md) para los candidatos descartados y la limitación local de Voxtral.

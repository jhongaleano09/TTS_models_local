# TTS open-weights para una MacBook Air con 16 GB: los mejores modelos para español latino y voz natural

## Conclusión ejecutiva

Después de revisar tu lista y contrastarla con modelos más recientes, documentación oficial, variantes MLX para Apple Silicon, soporte real de español, clonación/transferencia de voz y benchmarks públicos, mi conclusión es que **no escogería Breeze-TTS-2, Irodori, Indic-Speak ni los Higgs v2 que aparecen en tu lista**. Breeze-TTS-2 es especialmente engañoso para este caso: su tarjeta presume el primer puesto entre modelos open-weight en el leaderboard de TTS de Artificial Analysis, pero el propio modelo declara soporte bilingüe **solo para inglés y chino**. Es decir, un excelente resultado de arena no lo convierte en candidato para tu problema de español. citeturn7view0

Para una **MacBook Air con 16 GB de memoria unificada**, mi ranking final, priorizando en este orden **naturalidad humana, español latino/no marcadamente español de España, viabilidad local, expresividad y transferencia de voz**, queda así:

| Puesto | Modelo que instalaría | Veredicto para 16 GB | Español | Lo mejor |
|---|---|---|---|---|
| **1** | **ResembleAI/Chatterbox-Multilingual-es-mx-latam** | **Sí, holgado** | **es-419 / es-MX explícito** | El mejor ajuste directo a tu requerimiento de voz latina |
| **2** | **Qwen3-TTS-12Hz-1.7B-Base-4bit MLX** | **Sí, holgado** | Español entre 10 idiomas | Excelente equilibrio calidad, clonación, licencia y Mac |
| **3** | **Fish Audio S2 Pro, MLX 4-bit** | **Sí, pero tus 16 GB son el piso recomendado por el port** | Español Tier 2 | Probablemente el mayor techo expresivo/emocional de los finalistas |
| **4** | **Higgs TTS 3 4B, MLX cuantizado** | **Sí, usando cuantización; no elegiría BF16 en tu Air** | Español, incluido México | Muy fuerte en expresividad, paralingüística y benchmarks |
| **5** | **Fun-CosyVoice3-0.5B-2512, MLX 4-bit** | **Sí, muy holgado** | Español oficial | Pequeño pero sorprendentemente competente en prosodia y clonación |

Chatterbox V3 merece el primer lugar **específicamente por tu caso**, no porque necesariamente sea el mejor sintetizador absoluto del mundo. Resemble publicó un checkpoint separado para **Spanish Mexico / LATAM**, etiquetado como `es-419 / es-MX`, entrenado para comportamiento regional y separado del modelo `es-ES`; además, el framework soporta directamente `mps` en Mac y el modelo utiliza un backbone de apenas 500M parámetros. citeturn17view1turn17view2

Si cambiáramos la pregunta por “¿cuál tiene el mayor techo para sonar humano y expresivo, aunque el español latino no venga especializado?”, entonces **Fish S2 Pro y Higgs TTS 3 subirían**. Fish proporciona control libre de emociones/estilos y soporta 83 idiomas; Higgs ofrece clonación zero-shot, eventos vocales y control de emoción/prosodia, y en las evaluaciones publicadas por Boson supera a Fish y Qwen en varios conjuntos multilingües. citeturn8view0turn12academia18turn9view0turn9view1

Hay, sin embargo, una consideración importante para proyectos internos de empresa: **Fish S2 Pro y Higgs TTS 3 no tienen la misma libertad de uso que Chatterbox o Qwen**. Fish emplea su Fish Audio Research License y sus conversiones mantienen esos términos; Higgs TTS 3 está bajo una licencia de investigación/no comercial, y Boson indica explícitamente que usos de producción, APIs alojadas o que generen ingresos requieren licencia separada. Un proyecto “interno” dentro de una compañía no debería asumirse automáticamente como no comercial. citeturn8view0turn12search2turn19view0

## Lo que realmente cabe en una MacBook Air de 16 GB

El formato importa casi tanto como el modelo. **MLX es la opción natural en Apple Silicon** porque Apple lo diseñó alrededor de su arquitectura de memoria unificada; MLX-Audio, a su vez, implementa TTS sobre MLX y actualmente incluye soporte para familias como Qwen3-TTS, Higgs v3, OmniVoice y Chatterbox, además de cuantización de 3, 4, 6 y 8 bits. citeturn14search10turn19view2

No utilizaría como criterio “un modelo de 4B necesita 8 GB y por tanto entra”, porque durante síntesis también existen activaciones, estados del decoder, codec de audio y memoria de macOS. Para tu máquina he sido deliberadamente conservador: recomiendo checkpoints cuantizados cuando el backbone supera aproximadamente los dos mil millones de parámetros y prefiero versiones con runtime MLX ya existente. Esa es también la razón por la que algunos modelos técnicamente pequeños quedaron fuera de los cinco: **“hay un archivo cuantizado en Hugging Face” no equivale a “hay una ruta de inferencia estable en Mac”**. El caso de VoxCPM2 lo demuestra: existen checkpoints oficiales/comunitarios MLX 4-bit y 8-bit, pero MLX-Audio documentó problemas de loader con ellos durante 2026. citeturn22search1turn22search14turn22search24

### Margen práctico de memoria

| Modelo | Qué cargaría en tu Mac | Evidencia de tamaño/compatibilidad | Mi evaluación |
|---|---|---|---|
| **Chatterbox V3 es-MX/LatAm** | checkpoint oficial + PyTorch/MPS | 500M; el checkpoint T3 específico es de ~2.14 GB y el código oficial acepta `device="mps"` citeturn17view1turn17view2 | **Muy seguro en 16 GB** |
| **Qwen3-TTS 1.7B** | `mlx-community/...Base-4bit` | Existe conversión MLX 4-bit específica de Base; MLX-Audio soporta Qwen3-TTS y Apple Silicon citeturn21search0turn19view2 | **Muy seguro** |
| **Fish S2 Pro** | conversión MLX 4-bit | El port 4-bit ocupa alrededor de 2.4–2.6 GB y declara como objetivo Apple Silicon con **≥16 GB**; 24 GB+ es descrito como más cómodo citeturn12search2 | **Sí, pero estás exactamente en el mínimo recomendado** |
| **Higgs TTS 3** | MLX cuantizado, preferentemente Q6/runtime actual | MLX-Audio ya lista Higgs Audio v3; existe una conversión Q6 generada con MLX-Audio citeturn18search6turn19view2 | **Sí, con cuantización** |
| **CosyVoice3 0.5B** | MLX 4-bit | Existe `mlx-community/Fun-CosyVoice3-0.5B-2512-4bit`; el modelo base es solo 0.5B citeturn4search7turn4search24 | **Muy seguro** |

Con **Higgs hay una trampa concreta** que vale la pena evitar. El checkpoint `Reza2kn/Higgs-Audio-v3-TTS-4bit-MLX` parece perfecto porque pesa solo **2.04 GB**, pero su propia tarjeta advierte que **no es todavía un runtime drop-in completo**: cuantiza el cuerpo transformer, pero la arquitectura personalizada, los ocho codebooks y la decodificación requieren integración adicional. Por eso no te recomendaría descargar ese Q4 pensando que será “doble clic y listo”; para Higgs usaría una conversión creada para el runtime actual de MLX-Audio, como el Q6, antes que ese artefacto incompleto. citeturn19view0turn18search6

Fish merece también esa precaución. Su port 4-bit es precisamente uno de los pocos que declara explícitamente **16 GB de memoria unificada como objetivo mínimo**, por lo que encaja en tu requisito, pero no con el margen enorme de Chatterbox, CosyVoice o Qwen. Si el criterio es calidad y no velocidad, es perfectamente razonable aceptar que tarde más y mantener una sola inferencia a la vez. citeturn12search2

## Los modelos que recomiendo

**Chatterbox Multilingual V3 es-MX/LatAm — mi ganador para tu caso.** Resemble lanzó en junio de 2026 el V3 de Chatterbox con el mismo backbone de 0.5B, mejorando según la empresa similitud de hablante, estabilidad, reducción de alucinaciones y naturalidad conversacional. Más importante para ti: no tienes que confiar en que un modelo “multilingual Spanish” decida entre Madrid, Ciudad de México o un acento híbrido. Existe un fine-tune independiente para **LatAm Spanish**, marcado literalmente como `es-419 / es-MX`, dedicado a TTS expresivo y voice cloning latinoamericano. citeturn17view0turn17view1

Ese aislamiento regional me parece decisivo. Resemble explica que sus usuarios de español latino habían llegado al techo de calidad del modelo multilingüe y que el Language Pack existe precisamente porque un modelo entrenado sobre español genérico puede sonar correcto pero regionalmente “off”; el pack latino solo utiliza esa variante regional. Esto responde de forma mucho más directa a tu pedido de evitar voces “españolísimas” que cualquier leaderboard global. citeturn17view0

También tiene clonación zero-shot mediante un `audio_prompt_path`, pero no dependes conceptualmente de clonar para obtener español latino: el checkpoint ya está regionalizado. El repositorio oficial utiliza licencia MIT, soporta `cpu`, `cuda` o `mps`, e incluye controles de `exaggeration` y `cfg_weight` para aumentar expresividad o modificar ritmo. citeturn17view1turn17view2

**Qwen3-TTS 1.7B Base 4-bit — mi elección más equilibrada.** Qwen3-TTS 1.7B soporta chino, inglés, japonés, coreano, alemán, francés, ruso, portugués, **español** e italiano; la variante Base puede realizar clonación a partir de una referencia corta, mientras que la familia también dispone de CustomVoice y VoiceDesign. Para tu objetivo elegiría **Base**, porque puedes darle una referencia de una persona mexicana, colombiana u otro hablante latino y así usar el audio de referencia para fijar tanto timbre como buena parte de la pronunciación regional, en vez de confiar en una voz predefinida genérica. citeturn8view2

Es además uno de los modelos más cómodos para tu hardware: existe `mlx-community/Qwen3-TTS-12Hz-1.7B-Base-4bit`, y MLX-Audio tiene implementación explícita para Qwen3-TTS en Apple Silicon. Hay también CustomVoice y VoiceDesign cuantizados en MLX. citeturn21search0turn21search16turn19view2

Qwen ocupa el segundo lugar y no Fish porque tu pregunta no es únicamente “¿cuál suena más impresionante?”, sino “¿cuál usaría realmente en esta Mac para proyectos internos?”. Qwen ofrece un paquete mucho más redondo de memoria, mantenimiento, clonación y condiciones de uso. La versión MLX 4-bit mantiene el modelo muy por debajo de tu límite físico; además, la familia oficial tiene licencia Apache-2.0. citeturn10search1turn8view2

**Fish Audio S2 Pro — mi favorito para experimentar con máxima expresividad.** S2 Pro utiliza un diseño Dual-AR con un AR “slow” de aproximadamente 4B y uno rápido de 400M; fue entrenado con más de diez millones de horas y soporta más de 80 idiomas. El español aparece explícitamente como **Tier 2**. Más interesante para tu concepto de “humano”: S2 Pro acepta control textual libre sobre estilo/emoción y un vocabulario muy grande de etiquetas expresivas, además de voice cloning. citeturn8view0turn12academia18

Para narraciones, diálogos o material donde quieras que la voz **suspire, dude, cambie de energía, enfatice o se sienta menos “lector de TTS”**, Fish es probablemente el modelo que yo enfrentaría directamente a Higgs en una prueba ciega. La arquitectura y el paper enfatizan precisamente control por instrucciones y síntesis de hablante/conversación, no solamente inteligibilidad. citeturn12academia18turn12search14

Y sí existe una ruta realista para tu Mac: hay conversiones MLX, incluida una de 4 bits de alrededor de 2.4 GB orientada específicamente a Apple Silicon con **16 GB o más**, así como una conversión int8. citeturn12search0turn12search2 La contrapartida es doble: estás en el mínimo de memoria declarado por el port y Fish mantiene una licencia de investigación con condiciones separadas para uso comercial. citeturn8view0turn12search2

**Higgs TTS 3 4B — posiblemente el modelo técnicamente más impresionante de tu lista.** Boson posiciona Higgs TTS 3 como TTS conversacional para más de 100 idiomas, con zero-shot voice cloning, emoción, estilo, pausas, prosodia y eventos no verbales. La tarjeta oficial clasifica español dentro de su grupo de producción e identifica tanto España como México; para tu uso seleccionaría una referencia mexicana/latinoamericana cuando busques transferencia de voz para evitar que la región quede al azar. citeturn9view0turn9view1

Su gran argumento son los benchmarks. En la evaluación publicada por Boson, Higgs TTS 3 reporta mejores errores de reconocimiento que Fish S2 Pro y Qwen3-TTS en varios grupos multilingües y un mayor porcentaje de victorias en pruebas de capacidades emergentes. citeturn9view1 Es además uno de los más interesantes si con “transferir” te referías no solo al timbre, sino a **transferencia de estilo, emoción y forma de hablar**.

¿Por qué está cuarto y no primero? Por ingeniería y licencia. En tu Mac tienes que ser selectivo con la conversión MLX; el Q4 que aparece fácilmente en búsquedas no es todavía drop-in, mientras que MLX-Audio y conversiones Q6 posteriores ofrecen una ruta más razonable. Además, Boson dice expresamente que su licencia estándar es para investigación/no comercial y que producción o uso revenue-generating requiere acuerdo separado. citeturn19view0turn18search6turn19view2

**CosyVoice3 0.5B — el “sleeper” que agregaría a tu investigación.** El checkpoint `Fun-CosyVoice3-0.5B-2512` soporta nueve idiomas comunes, incluido **español**, y ofrece zero-shot y cross-lingual voice cloning. Su documentación oficial pone especial énfasis en consistencia del contenido, similitud de hablante y naturalidad/prosodia. citeturn4search7turn4search11

La razón por la que lo incluyo sobre varios nombres más famosos es tu restricción de hardware: existe conversión **MLX 4-bit de un modelo de apenas 0.5B**, de modo que puedes dedicar mucha menos memoria al backbone y no convertir macOS en una pelea constante contra swap. citeturn4search24 No posee, sin embargo, un checkpoint es-MX/es-419 como Chatterbox y por eso no lo pondría primero para tu objetivo específico.

## Qué dicen realmente los benchmarks y las arenas

Hay que tener bastante cuidado con “el número uno de TTS”. **No encontré entre las fuentes públicas que pude validar un arena contemporáneo, ciego y suficientemente grande que clasifique específicamente es-MX/es-419** entre Chatterbox V3, Higgs TTS 3, Fish S2 Pro, Qwen3-TTS y CosyVoice3. Las evaluaciones existentes mezclan inglés, chino y promedios multilingües, o son publicadas por el propio desarrollador. Por eso no usaría un único Elo o WER para decidir tu voz final. La propia Resemble reconoce explícitamente que CER puede demostrar inteligibilidad y estabilidad pero **no mide adecuadamente prosodia, naturalidad ni speaker similarity**. citeturn17view0

Chatterbox ofrece un caso particularmente útil. Resemble afirma que los resultados de la primera versión en el Hugging Face TTS Arena, sobre inglés, ya apuntaban a una baja distinguibilidad respecto de voz humana; pero **eso no es un resultado de V3 en español latino**. Para V3 publicaron CER por idioma y todavía están trabajando en MOS subjetivo y speaker-similarity. citeturn17view0

Hay incluso una inconsistencia interesante en su propia publicación que vale la pena señalar: el texto de Resemble menciona **0.28 % CER para el Language Pack de español latino**, mientras que unas líneas más abajo la tabla de modelos muestra **0.46 %** para `es-mx-latam`. Ambas cifras son extraordinariamente bajas como medida de inteligibilidad, pero esa discrepancia es precisamente una razón para no convertir el dato en una falsa precisión de ranking. citeturn17view0

Los números más comparables entre tus candidatos vienen de Boson, aunque son **benchmarks del propio fabricante**, no una arena independiente:

| Evaluación reportada por Boson | Higgs TTS 3 | Fish S2 Pro | Qwen3-TTS |
|---|---:|---:|---:|
| SeedTTS WER/CER ↓ | **1.11** | 1.31 | 1.30 |
| CV3 ↓ | **4.41** | 4.60 | 7.73 |
| MiniMax-Multilingual ↓ | **2.74** | 5.15 | 27.41 |
| Higgs-Multilingual ↓ | **3.61** | 8.68 | 97.09 |
| Emergent-TTS, win rate global ↑ | **53.65 %** | 43.80 % | 38.84 % |
| Emergent-TTS, paralingüística ↑ | **68.57 %** | inferior | inferior |

Estos son resultados de la tarjeta oficial de Higgs TTS 3 y deben interpretarse como **evidencia favorable pero no independiente**. El resultado que más me interesa para tu objetivo no es solo WER: el 68.57 % reportado en paralingüística es consistente con la ventaja práctica que esperaría de Higgs para risas, respiración, énfasis, pausas y habla conversacional. citeturn9view1

Fish S2 Pro, por su parte, tiene un paper técnico propio que reporta inferencia de producción con RTF 0.195 y tiempo al primer audio inferior a 100 ms en su entorno de servidor, además de sus capacidades de instrucciones y diálogo. Esos números **no deben trasladarse a una MacBook Air**, porque corresponden a otra plataforma de hardware; sí sirven para confirmar que S2 Pro es un sistema diseñado seriamente para TTS de producción, no simplemente otro checkpoint experimental de Hugging Face. citeturn12academia18

OmniVoice merece una mención aquí. Es un modelo de aproximadamente 0.6B orientado a zero-shot TTS en más de 600 idiomas, entrenado con unas 581 mil horas de datos de fuentes abiertas, y su paper reporta resultados de estado del arte en evaluaciones de chino, inglés y conjuntos multilingües. También tiene voice cloning y voice design y ya aparece como modelo soportado por MLX-Audio. citeturn20search17turn20search1turn19view2 No entró en mis cinco porque **la evidencia pública que pude validar no aísla la calidad del español latinoamericano**; para tu caso prefiero modelos con español mucho mejor caracterizado.

VoxCPM2 es otro caso que no descartaría por calidad. Es un modelo de 2B entrenado para 30 idiomas, incluido español, con voice design, clonación controlable y audio a 48 kHz; su reporte técnico habla de un WER medio interno de 1.68 % sobre 30 idiomas. citeturn9view2turn9view3turn4search16 Pero la existencia de conversiones MLX 4-bit junto con antecedentes de problemas de loader me hace ponerlo justo fuera del top cinco dado tu requisito **mandatorio de “instalar y usar”**, no simplemente “teóricamente cabe”. citeturn22search1turn22search14

## Revisión de los modelos que trajiste

Tu muestra inicial tenía varias buenas intuiciones, pero también modelos que las métricas de Hugging Face hacen parecer más relevantes de lo que son para español.

| Tu candidato | Mi decisión | Motivo |
|---|---|---|
| **BreezeBlue/Breeze-TTS-2** | **Descartar** | Muy interesante técnicamente y su tarjeta cita #1 en Artificial Analysis, pero declara únicamente **inglés y chino**; además el upstream pide entorno CUDA/Linux y GPU de 12 GB para su configuración documentada. citeturn7view0 |
| **HoppouAI/Breeze-TTS-2.cpp** | **Descartar** | El port puede mejorar la historia de hardware, pero no arregla el problema fundamental: los pesos base no están entrenados/documentados para español. citeturn7view0 |
| **fishaudio/s2-pro** | **Top cinco** | Español explícito, gran control expresivo, clonación, versión MLX que apunta a 16 GB. citeturn8view0turn12search2 |
| **Aratako/Irodori-TTS-v4-Large** | **Descartar** | Es un TTS japonés con voice cloning/design/style control; interesante, pero no candidato para español. citeturn2search1turn2search20 |
| **bodhan-ai/indic-speak** | **Descartar** | Orientado a 22 idiomas de India más inglés, no a español. citeturn2search2 |
| **adidsh/indic-speak-int8-onnx** | **Descartar** | Cuantizar Indic-Speak facilita ejecución, pero no agrega español al modelo base. citeturn2search2 |
| **szhengac25/higgs-audio-v2-generation-3B-base** | **Reemplazar** | Es generación anterior; hoy tiene mucho más sentido evaluar directamente **Higgs TTS 3**. citeturn9view0turn9view1 |
| **PierrunoYT/higgs-audio-v2-generation-3B-base** | **Reemplazar** | Mismo problema: usaría v3 y no invertiría tiempo ajustando un mirror de la generación previa. citeturn9view0 |
| **bosonai/higgs-tts-3-4b** | **Top cinco** | Excelente expresividad, español de producción, México explícito, clonación y benchmarks fuertes. citeturn9view0turn9view1 |
| **rumiik-ai/rumik-oss-1** | **Fuera del top** | Es interesante, pero no encontré en las fuentes primarias revisadas evidencia de español/LatAm comparable a los finalistas; sus evaluaciones publicadas no resuelven tu caso mejor que Chatterbox/Qwen/Fish/Higgs. citeturn2search3turn2search6 |
| **stepfun-ai/Step-Audio-TTS-3B** | **Fuera del top** | La documentación que pude validar destaca principalmente chino, inglés, japonés y variantes/dialectos asociados; no encontré una validación suficientemente clara de español para hacerlo pasar tu filtro obligatorio. citeturn1search22 |
| **canopylabs/3b-es_it-ft-research_release** | **Sí funciona, pero segunda línea** | Es una beta multilingüe Orpheus de 2025 específicamente ES/IT y existen ports MLX/GGUF, pero ha sido superada en mi selección por modelos de 2026 con mejor ecosistema/evaluación. citeturn21search2turn21search22 |
| **freddyaboulton/...Q4_K_M-GGUF** | **Viable, no top cinco** | Es la conversión Q4_K_M del anterior; muy razonable para experimentar localmente, pero hereda el modelo base de 2025. citeturn21search34 |
| **mlx-community/3b-es_it-* 4/6/8 bit** | **Viables, no top cinco** | La vía MLX tiene sentido en tu Mac, pero sigo prefiriendo Qwen3-TTS, Chatterbox o CosyVoice como inversiones actuales. La conversión MLX oficial/comunitaria deriva del mismo Canopy ES/IT. citeturn21search10turn21search22 |
| **marianbasti/Llama-3.2-3B-Orpheus-Rioplatense-1795** | **Solo si quieres ese acento** | “Rioplatense” es exactamente lo contrario de neutralidad regional: puede ser interesante para Argentina/Uruguay, pero para tu objetivo de una voz latina general o mexicana yo no lo pondría por delante de un checkpoint dedicado es-MX. |
| **gianpaj/...Q4_K_M-GGUF** | **Viable, no prioritario** | Mismo linaje ES/IT/Orpheus y mismas razones para quedar detrás de la generación actual. citeturn21search22turn21search34 |

Hay además una señal práctica sobre el Orpheus ES/IT: existe un reporte en el repositorio de Orpheus de un usuario que encontró omisiones aleatorias de palabras con inferencia vía vLLM en su fine-tune español, mientras que Transformers no mostraba el mismo problema. No significa que el checkpoint base esté roto, pero sí es una razón adicional para no elegir hoy esa ruta como primera opción si estabilidad de texto largo es importante. citeturn21search6

## Qué instalaría yo para tus proyectos

Si esta fuera **mi MacBook Air de 16 GB** y el objetivo fuese generar narración, demos, contenido interno y voces españolas latinoamericanas con prioridad absoluta en calidad, mantendría exactamente estos cinco checkpoints/linajes:

**Chatterbox Multilingual V3 es-MX/LatAm** sería mi voz predeterminada. Es el único de los finalistas que resuelve directamente tu molestia con el castellano peninsular mediante un modelo explícitamente `es-419 / es-MX`, y no mediante prompt engineering. Su tamaño, MPS nativo, licencia MIT y voice cloning lo convierten en la apuesta con menor fricción. citeturn17view1turn17view2

**Qwen3-TTS 1.7B Base 4-bit MLX** sería mi segundo motor, particularmente cuando disponga de una grabación corta de un hablante latino cuya voz/acento quiera transferir. Qwen soporta español, Base ofrece clonación de referencia y el port MLX cuantizado tiene un perfil mucho más cómodo para 16 GB que los TTS de 4–5B en precisión completa. citeturn8view2turn21search0

**Fish S2 Pro MLX 4-bit** sería mi motor experimental de alta expresividad: escenas emocionales, voces más dramáticas, narraciones menos planas y proyectos donde “sonar humano” sea más importante que latencia. En tu Mac lo consideraría una configuración **quality-first, one-job-at-a-time**, porque la propia conversión sitúa 16 GB en el límite inferior recomendado. citeturn8view0turn12search2

**Higgs TTS 3 4B cuantizado para MLX-Audio** sería mi laboratorio para expresión y conversación. Es el modelo de tu lista original que más conservaría: los resultados de Boson contra Fish y Qwen son suficientemente interesantes para justificar tenerlo instalado, pero usaría un build de MLX-Audio actual y no el Q4 incompleto de 2.04 GB. citeturn9view1turn19view0turn19view2

**CosyVoice3 0.5B 4-bit MLX** sería mi alternativa eficiente. No gana por especialización regional, pero combina español, clonación zero-shot/cross-lingual, buena orientación a prosodia y una huella diminuta frente a los modelos de varios miles de millones de parámetros. citeturn4search7turn4search24

En términos de **voz “más humana”**, mi apuesta para una escucha ciega sería **Fish S2 Pro ≈ Higgs TTS 3 > Qwen3-TTS > Chatterbox V3 > CosyVoice3**, entendiendo que esa comparación mezcla resultados publicados, arquitectura y capacidades expresivas y **no es un MOS independiente de es-419**. En términos de **mejor resultado para español latino en tu Mac**, el orden cambia a **Chatterbox es-MX/LatAm > Qwen3-TTS con referencia latina > Fish S2 Pro con referencia latina > Higgs TTS 3 con referencia mexicana > CosyVoice3**. Esa segunda clasificación es la que usaría para tu proyecto. citeturn17view0turn17view1turn8view2turn8view0turn9view0

Y hay una tercera clasificación importante para proyectos de empresa: si “internos” significa trabajo dentro de una organización comercial y quieres evitar ambigüedad de licenciamiento, **Chatterbox y Qwen subirían todavía más**, mientras que **Fish y Higgs requerirían revisar o negociar sus términos antes de convertirlos en infraestructura empresarial**. Chatterbox publica MIT; Qwen3-TTS tiene distribución Apache-2.0 en sus checkpoints; Fish conserva Fish Audio Research License y Higgs declara explícitamente investigación/no comercial con licenciamiento separado para producción. citeturn17view1turn10search1turn8view0turn19view0

Mi **ganador absoluto para lo que pediste es `ResembleAI/Chatterbox-Multilingual-es-mx-latam`**. Mi **segunda descarga sería Qwen3-TTS 1.7B Base 4-bit MLX**. Y, si el criterio pasa de “mejor voz latina utilizable” a “quiero ver hasta dónde puede llegar una voz generativa realmente expresiva”, **Fish S2 Pro y Higgs TTS 3 son los dos experimentos que no dejaría por fuera**.
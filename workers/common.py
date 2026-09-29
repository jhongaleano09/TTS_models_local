"""Utilidades compartidas por los workers.

Protocolo: el servidor Node lanza `python <worker> <job.json>`. El worker escribe
eventos en stdout como líneas `@@EVENT {json}`; cualquier otra salida se trata
como log. El proceso termina tras generar, liberando toda la memoria del modelo.
"""

import json
import re
import resource
import sys
import time
from pathlib import Path

import numpy as np
import soundfile as sf

EVENT_PREFIX = "@@EVENT "


def emit(event: str, **data) -> None:
    sys.stdout.write(EVENT_PREFIX + json.dumps({"event": event, **data}, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def load_job() -> dict:
    with open(sys.argv[1], encoding="utf-8") as f:
        return json.load(f)


def rss_peak_gb() -> float:
    # En macOS ru_maxrss viene en bytes.
    return resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1e9


def write_wav(path: str, audio: np.ndarray, sample_rate: int) -> float:
    audio = np.asarray(audio, dtype=np.float32).reshape(-1)
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    sf.write(path, audio, sample_rate, subtype="PCM_16")
    return len(audio) / sample_rate


def split_sentences(text: str, max_chars: int) -> list[str]:
    """Agrupa oraciones en fragmentos de hasta max_chars sin cortar palabras."""
    sentences = [s.strip() for s in re.split(r"(?<=[.!?¡¿…;:])\s+|\n+", text) if s.strip()]
    chunks, current = [], ""
    for sentence in sentences:
        while len(sentence) > max_chars:
            cut = sentence.rfind(" ", 0, max_chars)
            cut = cut if cut > 0 else max_chars
            if current:
                chunks.append(current)
                current = ""
            chunks.append(sentence[:cut].strip())
            sentence = sentence[cut:].strip()
        if current and len(current) + 1 + len(sentence) > max_chars:
            chunks.append(current)
            current = sentence
        else:
            current = f"{current} {sentence}".strip()
    if current:
        chunks.append(current)
    return chunks


class Timer:
    def __enter__(self):
        self.start = time.perf_counter()
        return self

    def __exit__(self, *exc):
        self.seconds = time.perf_counter() - self.start


def run(main) -> None:
    """Ejecuta main(job) reportando cualquier excepción como evento de error."""
    try:
        main(load_job())
    except Exception as exc:  # noqa: BLE001 — se reporta al servidor
        import traceback

        traceback.print_exc()
        emit("error", message=f"{type(exc).__name__}: {exc}")
        sys.exit(1)

"""Worker de Chatterbox Multilingual V3 es-MX/LatAm (PyTorch, MPS)."""

import os
import random
import sys
from pathlib import Path

os.environ.setdefault("PYTORCH_ENABLE_MPS_FALLBACK", "1")
# El allocator de MPS cachea un bloque por cada tamaño del KV-cache creciente; con los
# límites por defecto (1.7x el working set) llega a ~18 GB y fuerza swap en 16 GB.
# Con estos límites el pico real queda en ~9 GB y la generación es ~4x más rápida.
os.environ.setdefault("PYTORCH_MPS_HIGH_WATERMARK_RATIO", "0.7")
os.environ.setdefault("PYTORCH_MPS_LOW_WATERMARK_RATIO", "0.5")
sys.path.insert(0, str(Path(__file__).resolve().parent / "vendor"))

import numpy as np  # noqa: E402
import torch  # noqa: E402

from common import Timer, emit, rss_peak_gb, run, split_sentences, write_wav  # noqa: E402


def set_seed(seed: int) -> None:
    torch.manual_seed(seed)
    random.seed(seed)
    np.random.seed(seed)


def main(job: dict) -> None:
    from chatterbox.tts import ChatterboxTTS

    p = job["params"]
    device = p.get("device", "mps")
    if device == "mps" and not torch.backends.mps.is_available():
        emit("log", message="MPS no disponible, usando CPU")
        device = "cpu"

    emit("status", stage="loading", message=f"Cargando Chatterbox es-MX en {device}…")
    with Timer() as t_load:
        model = ChatterboxTTS.from_pretrained(device)
    emit("status", stage="loaded", load_seconds=round(t_load.seconds, 2))

    seed = int(p.get("seed") or 0)
    if seed:
        set_seed(seed)

    chunks = split_sentences(job["text"], int(p.get("chunk_chars", 300)))
    ref_audio = job.get("ref_audio")
    pieces = []
    silence = np.zeros(int(model.sr * 0.15), dtype=np.float32)

    with Timer() as t_gen:
        for i, chunk in enumerate(chunks):
            emit("status", stage="generating", message=f"Fragmento {i + 1}/{len(chunks)}", progress=i / len(chunks))
            wav = model.generate(
                chunk,
                # La referencia solo se procesa en el primer fragmento; luego se reutilizan los condicionales.
                audio_prompt_path=ref_audio if i == 0 else None,
                exaggeration=float(p["exaggeration"]),
                cfg_weight=float(p["cfg_weight"]),
                temperature=float(p["temperature"]),
                top_p=float(p["top_p"]),
                min_p=float(p["min_p"]),
                repetition_penalty=float(p["repetition_penalty"]),
                max_new_tokens=int(p["max_new_tokens"]),
                language_id="es",
            )
            pieces.append(wav.squeeze(0).cpu().numpy())
            if i < len(chunks) - 1:
                pieces.append(silence)

    duration = write_wav(job["output_path"], np.concatenate(pieces), model.sr)
    mps_gb = torch.mps.driver_allocated_memory() / 1e9 if device == "mps" else None
    emit(
        "done",
        sample_rate=model.sr,
        audio_seconds=round(duration, 2),
        load_seconds=round(t_load.seconds, 2),
        gen_seconds=round(t_gen.seconds, 2),
        rtf=round(t_gen.seconds / duration, 3) if duration else None,
        peak_memory_gb=round(mps_gb if mps_gb is not None else rss_peak_gb(), 2),
        segments=len(chunks),
    )


if __name__ == "__main__":
    run(main)

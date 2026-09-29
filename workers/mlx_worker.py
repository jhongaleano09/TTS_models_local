"""Worker MLX (mlx-audio) para Qwen3-TTS 1.7B Base 4-bit y Fish Audio S2 Pro 4-bit."""

from pathlib import Path

import mlx.core as mx
import numpy as np

from common import Timer, emit, run, write_wav

ROOT = Path(__file__).resolve().parent.parent
MODEL_PATHS = {
    "qwen": "mlx-community/Qwen3-TTS-12Hz-1.7B-Base-4bit",
    "fish": str(ROOT / "models" / "fish-s2-pro-4bit"),
}


def qwen_kwargs(job: dict, model) -> dict:
    p = job["params"]
    kwargs = dict(
        lang_code=p["lang_code"],
        temperature=float(p["temperature"]),
        top_k=int(p["top_k"]),
        top_p=float(p["top_p"]),
        repetition_penalty=float(p["repetition_penalty"]),
        max_tokens=int(p["max_tokens"]),
        split_pattern="\n" if p.get("split_lines", True) else "",
    )
    if job.get("ref_audio"):
        kwargs["ref_audio"] = job["ref_audio"]
        if job.get("ref_text"):
            kwargs["ref_text"] = job["ref_text"]
    return kwargs


def fish_kwargs(job: dict, model) -> dict:
    from mlx_audio.utils import load_audio

    p = job["params"]
    kwargs = dict(
        instruct=(p.get("instruct") or "").strip() or None,
        temperature=float(p["temperature"]),
        top_p=float(p["top_p"]),
        top_k=int(p["top_k"]),
        speed=float(p["speed"]),
        max_tokens=int(p["max_tokens"]),
        chunk_length=int(p["chunk_length"]),
        verbose=False,
    )
    if job.get("ref_audio"):
        # Fish espera un mx.array al sample rate del codec (44.1 kHz).
        kwargs["ref_audio"] = load_audio(job["ref_audio"], sample_rate=model.sample_rate)
        kwargs["ref_text"] = job.get("ref_text") or ""
    return kwargs


BUILDERS = {"qwen": qwen_kwargs, "fish": fish_kwargs}


def main(job: dict) -> None:
    from mlx_audio.tts.utils import load_model

    model_id = job["model"]
    path = MODEL_PATHS[model_id]
    if model_id == "fish" and not Path(path).exists():
        raise FileNotFoundError("Fish S2 Pro 4-bit no está ensamblado. Ejecuta: npm run download -- fish")

    emit("status", stage="loading", message=f"Cargando {model_id} ({Path(path).name})…")
    with Timer() as t_load:
        model = load_model(path)
    emit("status", stage="loaded", load_seconds=round(t_load.seconds, 2))

    seed = int(job["params"].get("seed") or 0)
    if seed:
        mx.random.seed(seed)
        np.random.seed(seed)

    kwargs = BUILDERS[model_id](job, model)
    pieces = []
    emit("status", stage="generating", message="Generando audio…", progress=0)
    with Timer() as t_gen:
        for i, result in enumerate(model.generate(text=job["text"], **kwargs)):
            pieces.append(np.array(result.audio, dtype=np.float32))
            emit("status", stage="generating", message=f"Segmento {i + 1} listo")

    if not pieces:
        raise RuntimeError("El modelo no devolvió audio.")
    duration = write_wav(job["output_path"], np.concatenate(pieces), model.sample_rate)
    emit(
        "done",
        sample_rate=model.sample_rate,
        audio_seconds=round(duration, 2),
        load_seconds=round(t_load.seconds, 2),
        gen_seconds=round(t_gen.seconds, 2),
        rtf=round(t_gen.seconds / duration, 3) if duration else None,
        peak_memory_gb=round(mx.get_peak_memory() / 1e9, 2),
        segments=len(pieces),
    )


if __name__ == "__main__":
    run(main)

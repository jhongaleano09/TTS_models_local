"""VoxCPM2 MLX: clonación real y diseño de voz, sin descargas en inferencia."""

import json
import os
from pathlib import Path

# El tokenizer y todos los pesos se resuelven desde la descarga local fijada.
os.environ["HF_HUB_OFFLINE"] = "1"
os.environ["TRANSFORMERS_OFFLINE"] = "1"

import mlx.core as mx
import numpy as np

from common import Timer, emit, run, split_sentences, write_wav

ROOT = Path(__file__).resolve().parent.parent
MODEL_DIR = ROOT / "models" / "voxcpm2-4bit"
REPO = "mlx-community/VoxCPM2-4bit"
REVISION = "dc9e5c187858da5f4a13dc4c247e297339216381"


def check_weights() -> None:
    try:
        manifest = json.loads((MODEL_DIR / "download-manifest.json").read_text())
        assert manifest["repo"] == REPO and manifest["revision"] == REVISION
        for name in ["config.json", "model.safetensors", "tokenizer.json", "tokenizer_config.json", "special_tokens_map.json"]:
            file = MODEL_DIR / name
            assert file.is_file() and file.stat().st_size > 0
            assert file.stat().st_size == manifest["files"][name]
    except (OSError, KeyError, ValueError, AssertionError) as exc:
        raise RuntimeError("Faltan pesos completos de VoxCPM2. Ejecuta: npm run download -- voxcpm2") from exc


def generation_kwargs(job: dict) -> tuple[dict, str]:
    p = job["params"]
    kwargs = dict(
        inference_timesteps=int(p["inference_timesteps"]),
        cfg_value=float(p["cfg_value"]),
        max_tokens=int(p["max_tokens"]),
        min_tokens=int(p["min_tokens"]),
        warmup_patches=int(p["warmup_patches"]),
        instruct=p.get("instruct", "").strip() or None,
    )
    audio = job.get("ref_audio")
    transcript = (job.get("ref_text") or "").strip()
    if not audio:
        return kwargs, "diseño" if kwargs["instruct"] else "voz nueva"
    mode = p["reference_mode"]
    if mode == "auto":
        mode = "combined" if transcript else "reference"
    if mode in {"combined", "continuation"}:
        if not transcript:
            raise ValueError("Este modo requiere una transcripción exacta. Elige Automático o Solo timbre.")
        # En este runtime ref_text es un alias sin uso. La continuación consume
        # prompt_audio + prompt_text; enviar solo ref_text ignoraría la transcripción.
        kwargs.update(prompt_audio=audio, prompt_text=transcript)
    if mode in {"combined", "reference"}:
        kwargs["ref_audio"] = audio
    return kwargs, mode


def generate_chunks(job: dict, model):
    kwargs, mode = generation_kwargs(job)
    chunks = split_sentences(job["text"], int(job["params"]["chunk_chars"]))
    if not chunks:
        raise ValueError("El guion está vacío.")
    emit("log", message=f"VoxCPM2: modo {mode}; {len(chunks)} fragmento(s)")
    for i, text in enumerate(chunks):
        emit("status", stage="generating", message=f"Fragmento {i + 1}/{len(chunks)} · {mode}", progress=i / len(chunks))
        results = list(model.generate(text=text, **kwargs))
        if not results:
            raise RuntimeError("VoxCPM2 no devolvió audio.")
        audio = np.concatenate([np.asarray(r.audio, dtype=np.float32).reshape(-1) for r in results])
        if not audio.size or not np.isfinite(audio).all() or np.max(np.abs(audio)) < 1e-6:
            raise RuntimeError("VoxCPM2 devolvió audio vacío, silencioso o inválido.")
        # Sin referencia, conservar la voz del primer fragmento en el resto.
        # Los arrays de referencia están a 48 kHz; el runtime los remuestrea.
        if not job.get("ref_audio") and i == 0 and len(chunks) > 1:
            kwargs["ref_audio"] = audio[:model.sample_rate * 10]
        yield audio


def main(job: dict) -> None:
    from mlx_audio.tts.utils import load_model

    check_weights()
    # Validar la combinación de referencia antes de reservar memoria del modelo.
    generation_kwargs(job)
    emit("status", stage="loading", message="Cargando VoxCPM2 4-bit…")
    with Timer() as t_load:
        model = load_model(str(MODEL_DIR))
    emit("status", stage="loaded", load_seconds=round(t_load.seconds, 2))
    seed = int(job["params"].get("seed") or 0)
    mx.random.seed(seed)
    np.random.seed(seed)
    pieces = []
    silence = np.zeros(int(model.sample_rate * job["params"]["silence_duration"]), dtype=np.float32)
    with Timer() as t_gen:
        for audio in generate_chunks(job, model):
            if pieces:
                pieces.append(silence)
            pieces.append(audio)
            mx.clear_cache()
    duration = write_wav(job["output_path"], np.concatenate(pieces), model.sample_rate)
    emit("done", sample_rate=model.sample_rate, audio_seconds=round(duration, 2),
         load_seconds=round(t_load.seconds, 2), gen_seconds=round(t_gen.seconds, 2),
         rtf=round(t_gen.seconds / duration, 3), peak_memory_gb=round(mx.get_peak_memory() / 1e9, 2),
         segments=(len(pieces) + 1) // 2)


if __name__ == "__main__":
    run(main)

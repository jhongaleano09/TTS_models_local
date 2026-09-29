"""Worker de Fun-CosyVoice3 0.5B 4-bit (MLX, vía mlx-audio-plus).

Corre en su propio entorno (.venvs/cosyvoice): mlx-audio-plus es un fork que se instala
como el paquete `mlx_audio` y chocaría con el mlx-audio de Qwen, Fish y Higgs.
"""

import librosa
import mlx.core as mx
import numpy as np

from common import Timer, emit, run, split_sentences, write_wav

MODEL_REPO = "mlx-community/Fun-CosyVoice3-0.5B-2512-4bit"
# CosyVoice3 se entrenó con este prefijo de sistema delante del texto de prompt/instrucción.
SYSTEM = "You are a helpful assistant."
END = "<|endofprompt|>"


def resolve_mode(p: dict, ref_text: str | None) -> str:
    mode = p.get("mode") or "auto"
    instruct = (p.get("instruct") or "").strip()
    if mode == "auto":
        return "instruct" if instruct else "zero-shot" if ref_text else "cross-lingual"
    if mode == "zero-shot" and not ref_text:
        emit("log", message="La voz no tiene transcripción: se usa cross-lingual.")
        return "cross-lingual"
    if mode == "instruct" and not instruct:
        emit("log", message="Modo instruct sin instrucción: se usa una instrucción neutra.")
    return mode


def main(job: dict) -> None:
    from mlx_audio.tts.utils import load_model

    if not job.get("ref_audio"):
        raise ValueError("CosyVoice3 necesita un audio de referencia.")
    p = job["params"]

    emit("status", stage="loading", message="Cargando CosyVoice3 (0.5B 4-bit)…")
    with Timer() as t_load:
        model = load_model(MODEL_REPO)
        # generate() carga los pesos y tokenizers de forma perezosa: se fuerza aquí para medir la carga.
        model._ensure_model_loaded()
        model._ensure_tokenizers_loaded()
    emit("status", stage="loaded", load_seconds=round(t_load.seconds, 2))

    seed = int(p.get("seed") or 0)
    if seed:
        mx.random.seed(seed)
        np.random.seed(seed)

    sr = model.sample_rate
    ref_audio = mx.array(librosa.load(job["ref_audio"], sr=sr, mono=True)[0])
    ref_text = (job.get("ref_text") or "").strip() or None
    mode = resolve_mode(p, ref_text)
    emit("log", message=f"Modo {mode}")

    # stt_model=None: la transcripción ya viene de la pestaña Voces; no se carga otro Whisper.
    kwargs = dict(ref_audio=ref_audio, stt_model=None, verbose=False)
    if mode == "zero-shot":
        kwargs["ref_text"] = f"{SYSTEM}{END}{ref_text}"
    elif mode == "instruct":
        instruct = (p.get("instruct") or "").strip() or "Speak naturally."
        kwargs["instruct_text"] = f"{SYSTEM} {instruct}"

    chunks = split_sentences(job["text"], int(p.get("chunk_chars", 200)))
    silence = np.zeros(int(sr * 0.12), dtype=np.float32)
    pieces = []
    with Timer() as t_gen:
        for i, chunk in enumerate(chunks):
            emit("status", stage="generating", message=f"Fragmento {i + 1}/{len(chunks)}", progress=i / len(chunks))
            text = f"{SYSTEM}{END}{chunk}" if mode == "cross-lingual" else chunk
            result = next(model.generate(text=text, **kwargs))
            if pieces:
                pieces.append(silence)
            pieces.append(np.array(result.audio, dtype=np.float32).reshape(-1))

        if not pieces:
            raise RuntimeError("El modelo no devolvió audio.")
        audio = np.concatenate(pieces)
        speed = float(p.get("speed", 1.0))
        if abs(speed - 1.0) > 1e-3:
            audio = librosa.effects.time_stretch(audio, rate=speed)

    duration = write_wav(job["output_path"], audio, sr)
    emit(
        "done",
        sample_rate=sr,
        audio_seconds=round(duration, 2),
        load_seconds=round(t_load.seconds, 2),
        gen_seconds=round(t_gen.seconds, 2),
        rtf=round(t_gen.seconds / duration, 3) if duration else None,
        peak_memory_gb=round(mx.get_peak_memory() / 1e9, 2),
        segments=len(chunks),
        mode=mode,
    )


if __name__ == "__main__":
    run(main)

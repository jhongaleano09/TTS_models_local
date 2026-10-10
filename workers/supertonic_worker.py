"""Supertonic 3: SDK oficial 1.3.1, pesos locales y proceso independiente."""

from pathlib import Path

import numpy as np

from common import Timer, emit, rss_peak_gb, run, write_wav

ROOT = Path(__file__).resolve().parent.parent
MODEL_DIR = ROOT / "models" / "supertonic-3"


def main(job: dict) -> None:
    from supertonic import TTS
    from supertonic.utils import chunk_text

    p = job["params"]
    emit("status", stage="loading", message="Cargando Supertonic 3 (ONNX · CPU)…")
    with Timer() as t_load:
        tts = TTS(
            model="supertonic-3",
            model_dir=MODEL_DIR,
            auto_download=False,
            # 0 fuerza automático de ORT, sin heredar variables de entorno del SDK.
            intra_op_num_threads=int(p.get("intra_op_num_threads", 0)),
            inter_op_num_threads=int(p.get("inter_op_num_threads", 0)),
        )
        custom = str(p.get("custom_style_path") or "").strip()
        if custom:
            path = Path(custom).expanduser()
            if not path.is_absolute():
                path = ROOT / path
            style = tts.get_voice_style_from_path(path)
        else:
            style = tts.get_voice_style(p.get("voice_name", "M1"))
        # ONNX solo admite un hablante por generación del Arena.
        for name, vector, shape in (("style_ttl", style.ttl, (1, 50, 256)), ("style_dp", style.dp, (1, 8, 16))):
            if vector.shape != shape or not np.isfinite(vector).all():
                raise ValueError(f"{name}: se espera un estilo Supertonic 3 de forma {shape} con números finitos.")
    emit("status", stage="loaded", load_seconds=round(t_load.seconds, 2))

    seed = int(p.get("seed") or 0)
    if seed:
        np.random.seed(seed)
    lang = p.get("lang", "es")
    chunk_length = int(p.get("max_chunk_length", 0)) or None
    effective_length = chunk_length or (120 if lang == "ko" else 300)
    segments = len(chunk_text(job["text"], effective_length))
    emit("log", message=f"Voz: {custom or p.get('voice_name', 'M1')} · idioma {lang} · {segments} fragmentos · CPU")
    emit("status", stage="generating", message=f"Generando {segments} fragmento(s)…")
    with Timer() as t_gen:
        audio, _ = tts.synthesize(
            text=job["text"],
            voice_style=style,
            total_steps=int(p.get("total_steps", 8)),
            speed=float(p.get("speed", 1.05)),
            max_chunk_length=chunk_length,
            silence_duration=float(p.get("silence_duration", 0.3)),
            lang=lang,
            verbose=bool(p.get("verbose", False)),
        )
    if not audio.size or not np.isfinite(audio).all():
        raise RuntimeError("El modelo no devolvió audio válido.")
    duration = write_wav(job["output_path"], audio, tts.sample_rate)
    emit(
        "done",
        sample_rate=tts.sample_rate,
        audio_seconds=round(duration, 2),
        load_seconds=round(t_load.seconds, 2),
        gen_seconds=round(t_gen.seconds, 2),
        rtf=round(t_gen.seconds / duration, 3) if duration else None,
        peak_memory_gb=round(rss_peak_gb(), 2),
        segments=segments,
        voice=custom or p.get("voice_name", "M1"),
        language=lang,
        provider="CPUExecutionProvider",
    )


if __name__ == "__main__":
    run(main)

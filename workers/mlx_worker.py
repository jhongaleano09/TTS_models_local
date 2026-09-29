"""Worker MLX (mlx-audio) para Qwen3-TTS 1.7B Base 4-bit, Fish Audio S2 Pro 4-bit y Higgs TTS 3 6-bit."""

import re
from pathlib import Path

import mlx.core as mx
import numpy as np

from common import Timer, emit, run, split_sentences, write_wav

ROOT = Path(__file__).resolve().parent.parent
MODEL_PATHS = {
    "qwen": "mlx-community/Qwen3-TTS-12Hz-1.7B-Base-4bit",
    "fish": str(ROOT / "models" / "fish-s2-pro-4bit"),
    "higgs": "whitelabel/mlx-q6-higgs-tts-3-4b",
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


SPEAKER_TAG = re.compile(r"(<\|speaker:\d+\|>)")
# Fin de oración (o salto de línea) seguido de espacio: nunca corta dentro de una etiqueta [..].
SENTENCE_END = re.compile(r"(?<=[.!?…:;»”\"])\s+|\n+")


def fish_turns(text: str, chunk_length: int) -> str:
    """Divide el texto en turnos <|speaker:N|> de hasta chunk_length bytes.

    mlx-audio solo aplica chunk_length cuando el texto trae etiquetas de hablante; sin ellas
    envía todo en un único bloque y el audio se corta al llegar a max_tokens (~47 s con 1024).
    """
    parts = SPEAKER_TAG.split(text)
    if len(parts) == 1:
        parts = ["<|speaker:0|>", text]
    elif parts[0].strip():
        parts = ["<|speaker:0|>", parts[0], *parts[1:]]
    else:
        parts = parts[1:]

    turns = []
    for tag, body in zip(parts[0::2], parts[1::2]):
        chunk = ""
        for sentence in (s.strip() for s in SENTENCE_END.split(body)):
            if not sentence:
                continue
            candidate = f"{chunk} {sentence}".strip()
            if chunk and len(candidate.encode("utf-8")) > chunk_length:
                turns.append(tag + chunk)
                chunk = sentence
            else:
                chunk = candidate
        if chunk:
            turns.append(tag + chunk)
    return "".join(turns)


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

HIGGS_DELIVERY = {"expresiva": "<|prosody:expressive_high|>", "contenida": "<|prosody:expressive_low|>"}
HIGGS_PACE = {
    "muy lento": "<|prosody:speed_very_slow|>",
    "lento": "<|prosody:speed_slow|>",
    "rápido": "<|prosody:speed_fast|>",
    "muy rápido": "<|prosody:speed_very_fast|>",
}
HIGGS_TOKEN = re.compile(r"<\|[a-z]+:[a-z_]+\|>")
# Inicio de oración: comienzo del fragmento o espacio tras un signo de cierre.
SENTENCE_START = re.compile(r"(^|(?<=[.!?…])\s+)(?=\S)")


def higgs_chunks(text: str, p: dict) -> list[str]:
    """Fragmentos de hasta chunk_chars con los tokens globales al inicio de cada oración.

    Los tokens de emoción/estilo/ritmo de Higgs colorean solo la oración que abren, así que
    la entrega y el ritmo globales se repiten en cada una.
    """
    prefix = HIGGS_DELIVERY.get(p.get("delivery"), "") + HIGGS_PACE.get(p.get("pace"), "")
    chunks = split_sentences(text, int(p["chunk_chars"]))
    if prefix:
        chunks = [SENTENCE_START.sub(lambda m: m.group(1) + prefix, c) for c in chunks]
    return chunks


def higgs_generate(job: dict, model):
    """Genera fragmento a fragmento manteniendo la misma voz.

    mlx-audio envía todo el texto de una vez y corta en max_new_tokens (1024 frames ≈ 41 s),
    así que el worker divide por oraciones. La referencia se codifica una sola vez; sin
    referencia, el primer fragmento generado pasa a ser la referencia de los siguientes.
    """
    p = job["params"]
    top_p = float(p["top_p"])
    sample = dict(
        temperature=float(p["temperature"]),
        top_k=int(p["top_k"]),
        top_p=top_p if top_p < 1 else None,
        max_new_tokens=int(p["max_new_tokens"]),
    )
    ref_codes, ref_text = None, None
    if job.get("ref_audio"):
        ref_codes = model.encode_reference_audio(job["ref_audio"])
        ref_text = job.get("ref_text") or None

    chunks = higgs_chunks(job["text"], p)
    for i, chunk in enumerate(chunks):
        emit("status", stage="generating", message=f"Fragmento {i + 1}/{len(chunks)}", progress=i / len(chunks))
        result = next(model.generate(text=chunk, ref_audio_codes=ref_codes, ref_text=ref_text, **sample))
        audio = np.array(result.audio, dtype=np.float32)
        if ref_codes is None and len(chunks) > 1:
            ref_codes = model.encode_reference_audio(audio)
            ref_text = HIGGS_TOKEN.sub("", chunk).strip()
        yield audio


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

    pieces = []
    emit("status", stage="generating", message="Generando audio…", progress=0)
    with Timer() as t_gen:
        if model_id == "higgs":
            silence = np.zeros(int(model.sample_rate * 0.12), dtype=np.float32)
            for audio in higgs_generate(job, model):
                pieces.extend([silence, audio] if pieces else [audio])
            segments = (len(pieces) + 1) // 2
        else:
            kwargs = BUILDERS[model_id](job, model)
            text = job["text"]
            if model_id == "fish":
                text = fish_turns(text, int(job["params"]["chunk_length"]))
            for i, result in enumerate(model.generate(text=text, **kwargs)):
                pieces.append(np.array(result.audio, dtype=np.float32))
                emit("status", stage="generating", message=f"Segmento {i + 1} listo")
            segments = len(pieces)

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
        segments=segments,
    )


if __name__ == "__main__":
    run(main)

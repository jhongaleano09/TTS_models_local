"""Transcribe un audio de referencia con Whisper large-v3-turbo (MLX, 8-bit).

Qwen3-TTS (modo ICL) y Fish S2 Pro clonan mejor cuando reciben el texto exacto
que se dice en el audio de referencia.
"""

from common import Timer, emit, run

WHISPER_REPO = "mlx-community/whisper-large-v3-turbo-asr-8bit"


def main(job: dict) -> None:
    from mlx_audio.stt.utils import load_model

    emit("status", stage="loading", message="Cargando Whisper…")
    model = load_model(WHISPER_REPO)
    emit("status", stage="generating", message="Transcribiendo…")
    with Timer() as t:
        result = model.generate(job["audio_path"], language=job.get("language") or "es")
    emit("done", text=result.text.strip(), seconds=round(t.seconds, 2))


if __name__ == "__main__":
    run(main)

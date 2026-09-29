"""Descarga previa de los pesos de los modelos del Arena.

Uso:  npm run download [-- chatterbox|qwen|fish|higgs|cosyvoice|whisper|voices ...]
Sin argumentos descarga todo. Los pesos quedan en la caché de Hugging Face
(~/.cache/huggingface), salvo Fish 4-bit, que se ensambla en models/.
"""

import os
import sys
import urllib.request
from pathlib import Path

from huggingface_hub import hf_hub_download, snapshot_download

ROOT = Path(__file__).resolve().parent.parent
MODELS_DIR = ROOT / "models"
VOICES_DIR = ROOT / "assets" / "voices"

CHATTERBOX_BASE = "ResembleAI/chatterbox"
CHATTERBOX_ESMX = "ResembleAI/Chatterbox-Multilingual-es-mx-latam"
QWEN_REPO = "mlx-community/Qwen3-TTS-12Hz-1.7B-Base-4bit"
FISH_4BIT_REPO = "majentik/fishaudio-s2-pro-MLX-4bit"
FISH_8BIT_REPO = "mlx-community/fish-audio-s2-pro-8bit"
FISH_4BIT_DIR = MODELS_DIR / "fish-s2-pro-4bit"
WHISPER_REPO = "mlx-community/whisper-large-v3-turbo-asr-8bit"
HIGGS_REPO = "whitelabel/mlx-q6-higgs-tts-3-4b"
COSYVOICE_REPO = "mlx-community/Fun-CosyVoice3-0.5B-2512-4bit"
COSYVOICE_S3_REPO = "mlx-community/S3TokenizerV3"

DEFAULT_VOICES = {
    "es_mx_f1.wav": "https://storage.googleapis.com/chatterbox-demo-samples/mtl-v3-single-language-prompts/es-latam/es_mx_f1.wav",
}


def log(msg: str) -> None:
    print(f"[download] {msg}", flush=True)


def chatterbox() -> None:
    log("Chatterbox: archivos base (voice encoder, tokenizer, voz por defecto)")
    snapshot_download(
        CHATTERBOX_BASE,
        allow_patterns=["ve.pt", "grapheme_mtl_merged_expanded_v1.json", "conds.pt"],
    )
    log("Chatterbox: checkpoints es-MX/LatAm V3 (~2.9 GB)")
    for f in ("t3_es_mx_latam.safetensors", "s3gen_v3.pt"):
        hf_hub_download(CHATTERBOX_ESMX, f)


def qwen() -> None:
    log(f"Qwen3-TTS: {QWEN_REPO} (~2.3 GB)")
    snapshot_download(QWEN_REPO)


def fish() -> None:
    """Ensambla Fish S2 Pro 4-bit.

    El port 4-bit publica el codec como `codec.pth`, pero el loader de mlx-audio
    solo reconoce `codec.safetensors`; sin él, carga los pesos del LLM como codec
    (strict=False) y genera ruido. Se combina el LLM 4-bit con el codec ya
    convertido del repo 8-bit de mlx-community.
    """
    log(f"Fish S2 Pro: LLM 4-bit de {FISH_4BIT_REPO} (~2.6 GB)")
    llm_dir = Path(snapshot_download(FISH_4BIT_REPO, ignore_patterns=["codec.pth"]))
    log(f"Fish S2 Pro: codec.safetensors de {FISH_8BIT_REPO} (~1.9 GB)")
    codec = Path(hf_hub_download(FISH_8BIT_REPO, "codec.safetensors"))

    FISH_4BIT_DIR.mkdir(parents=True, exist_ok=True)
    for src in list(llm_dir.iterdir()) + [codec]:
        if src.name.startswith("."):
            continue
        dst = FISH_4BIT_DIR / src.name
        if dst.is_symlink() or dst.exists():
            dst.unlink()
        os.symlink(src.resolve(), dst)
    log(f"Fish S2 Pro 4-bit ensamblado en {FISH_4BIT_DIR.relative_to(ROOT)}")


def higgs() -> None:
    """Higgs TTS 3 cuantizado a 6 bits para mlx-audio.

    El Q4 de Reza2kn no es un runtime completo y el propio conversor descartó su Q4 por calidad
    en pruebas de escucha; este Q6 ya trae codec.safetensors y model_type=higgs_audio_v3.
    """
    log(f"Higgs TTS 3: {HIGGS_REPO} (~3.7 GB)")
    snapshot_download(HIGGS_REPO, ignore_patterns=["samples/*"])


def cosyvoice() -> None:
    log(f"CosyVoice3: {COSYVOICE_REPO} (~1.2 GB)")
    snapshot_download(COSYVOICE_REPO)
    log(f"CosyVoice3: tokenizer de voz {COSYVOICE_S3_REPO} (~0.45 GB)")
    snapshot_download(COSYVOICE_S3_REPO)


def voices() -> None:
    VOICES_DIR.mkdir(parents=True, exist_ok=True)
    for name, url in DEFAULT_VOICES.items():
        dst = VOICES_DIR / name
        if not dst.exists():
            log(f"Voz de referencia: {name}")
            urllib.request.urlretrieve(url, dst)


def whisper() -> None:
    log(f"Whisper (transcripción de voces de referencia): {WHISPER_REPO} (~0.9 GB)")
    snapshot_download(WHISPER_REPO)


TASKS = {
    "voices": voices,
    "chatterbox": chatterbox,
    "qwen": qwen,
    "fish": fish,
    "higgs": higgs,
    "cosyvoice": cosyvoice,
    "whisper": whisper,
}

if __name__ == "__main__":
    selected = sys.argv[1:] or list(TASKS)
    for name in selected:
        if name not in TASKS:
            sys.exit(f"Tarea desconocida: {name}. Opciones: {', '.join(TASKS)}")
        TASKS[name]()
    log("Listo.")

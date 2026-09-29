#!/usr/bin/env bash
# Instala todo lo necesario: dependencias Node, dos entornos Python aislados y los pesos.
set -euo pipefail
cd "$(dirname "$0")/.."

need() { command -v "$1" >/dev/null 2>&1 || { echo "✗ Falta '$1'. $2"; exit 1; }; }
need uv "Instálalo con: curl -LsSf https://astral.sh/uv/install.sh | sh"
need ffmpeg "Instálalo con: brew install ffmpeg"
[[ "$(uname -m)" == "arm64" ]] || echo "⚠ MLX requiere Apple Silicon; Qwen3-TTS, Fish, Higgs y CosyVoice3 no funcionarán en esta máquina."

echo "→ Dependencias Node"
npm install --no-audit --no-fund

# chatterbox exige transformers 4.46 y mlx-audio >= 5.14, y mlx-audio-plus (CosyVoice3) se instala
# como el mismo paquete `mlx_audio` que mlx-audio: por eso son tres venvs.
echo "→ Entorno PyTorch (Chatterbox) en .venvs/torch"
uv venv -q --allow-existing --python 3.11 .venvs/torch
uv pip install -q --python .venvs/torch/bin/python -r workers/requirements-torch.txt

echo "→ Entorno MLX (Qwen3-TTS, Fish S2 Pro, Higgs TTS 3, Whisper) en .venvs/mlx"
uv venv -q --allow-existing --python 3.11 .venvs/mlx
uv pip install -q --python .venvs/mlx/bin/python -r workers/requirements-mlx.txt

echo "→ Entorno MLX (CosyVoice3) en .venvs/cosyvoice"
uv venv -q --allow-existing --python 3.11 .venvs/cosyvoice
uv pip install -q --python .venvs/cosyvoice/bin/python -r workers/requirements-cosyvoice.txt
# Su dependencia mlx-audio 0.2.10 sobrescribe archivos compartidos de mlx_audio/: se restauran los del fork.
uv pip install -q --python .venvs/cosyvoice/bin/python --reinstall --no-deps mlx-audio-plus==0.1.8

echo "→ Pesos de los modelos (~16 GB la primera vez)"
.venvs/mlx/bin/python scripts/download_models.py

echo "✓ Listo. Arranca con: npm run dev"

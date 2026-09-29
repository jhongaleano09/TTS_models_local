#!/usr/bin/env bash
# Instala todo lo necesario: dependencias Node, dos entornos Python aislados y los pesos.
set -euo pipefail
cd "$(dirname "$0")/.."

need() { command -v "$1" >/dev/null 2>&1 || { echo "✗ Falta '$1'. $2"; exit 1; }; }
need uv "Instálalo con: curl -LsSf https://astral.sh/uv/install.sh | sh"
need ffmpeg "Instálalo con: brew install ffmpeg"
[[ "$(uname -m)" == "arm64" ]] || echo "⚠ MLX requiere Apple Silicon; Qwen3-TTS y Fish no funcionarán en esta máquina."

echo "→ Dependencias Node"
npm install --no-audit --no-fund

# chatterbox exige transformers 4.46 y mlx-audio >= 5.14: por eso son dos venvs.
echo "→ Entorno PyTorch (Chatterbox) en .venvs/torch"
uv venv -q --allow-existing --python 3.11 .venvs/torch
uv pip install -q --python .venvs/torch/bin/python -r workers/requirements-torch.txt

echo "→ Entorno MLX (Qwen3-TTS, Fish S2 Pro, Whisper) en .venvs/mlx"
uv venv -q --allow-existing --python 3.11 .venvs/mlx
uv pip install -q --python .venvs/mlx/bin/python -r workers/requirements-mlx.txt

echo "→ Pesos de los modelos (~10 GB la primera vez)"
.venvs/mlx/bin/python scripts/download_models.py

echo "✓ Listo. Arranca con: npm run dev"

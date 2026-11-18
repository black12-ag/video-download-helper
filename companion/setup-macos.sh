#!/bin/sh
set -eu
if [ "$#" -lt 1 ]; then
  echo 'Usage: sh companion/setup-macos.sh EXTENSION_ID [chrome|comet|chrome-testing|chromium]'
  exit 1
fi
if ! command -v uv >/dev/null 2>&1; then
  echo 'Install uv from https://docs.astral.sh/uv/getting-started/installation/ or use the manual setup in companion/README.md.'
  exit 1
fi
if ! command -v ffmpeg >/dev/null 2>&1; then
  echo 'Install FFmpeg first, then run this command again. See companion/README.md.'
  exit 1
fi
vdh_runtime="$HOME/.local/share/video-download-helper/venv"
if [ ! -x "$vdh_runtime/bin/python" ]; then
  uv venv --python 3.13 "$vdh_runtime"
fi
uv pip install --upgrade --python "$vdh_runtime/bin/python" 'yt-dlp[default]'
vdh_script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
exec "$vdh_runtime/bin/python" "$vdh_script_dir/install.py" --extension-id "$1" --browser "${2:-chrome}" --ytdlp "$vdh_runtime/bin/yt-dlp"

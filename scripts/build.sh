#!/usr/bin/env bash

set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ -x "$root/.venv/Scripts/python.exe" ]]; then
  python_executable="$root/.venv/Scripts/python.exe"
elif [[ -x "$root/.venv/bin/python" ]]; then
  python_executable="$root/.venv/bin/python"
else
  python_executable="${PYTHON:-python}"
fi

cd "$root"
"$python_executable" -m cloudsprocket.build

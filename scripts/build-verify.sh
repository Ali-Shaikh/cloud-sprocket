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

run_id="$(date +%s)-$$"
dist_path="$root/.tmp/dist-verify-$run_id"
work_path="$root/.tmp/pyinstaller-work-$run_id"
spec_path="$root/.tmp/pyinstaller-spec-$run_id"
temp_path="$root/.tmp/build-temp-$run_id"

mkdir -p "$dist_path" "$work_path" "$spec_path" "$temp_path"
export TMP="$temp_path"
export TEMP="$temp_path"

cd "$root"
"$python_executable" -m cloudsprocket.build --distpath "$dist_path" --workpath "$work_path" --specpath "$spec_path" --temp-dir "$temp_path"

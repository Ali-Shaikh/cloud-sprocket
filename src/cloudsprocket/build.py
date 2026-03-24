from __future__ import annotations

import subprocess
import sys
from pathlib import Path

APP_BUILD_NAME = "CloudSprocket"
MACOS_BUNDLE_ID = "com.cloudsprocket.app"


def project_root() -> Path:
    return Path(__file__).resolve().parents[2]


def build_command(
    *,
    root: Path | None = None,
    python_executable: str | None = None,
    platform_name: str | None = None,
) -> list[str]:
    resolved_root = root or project_root()
    resolved_platform = platform_name or sys.platform
    resolved_python = python_executable or sys.executable

    command = [
        resolved_python,
        "-m",
        "PyInstaller",
        "--noconfirm",
        "--clean",
        "--windowed",
        "--name",
        APP_BUILD_NAME,
        "--paths",
        str(resolved_root / "src"),
        "--specpath",
        str(resolved_root / "build" / "pyinstaller"),
        str(resolved_root / "src" / "cloudsprocket" / "__main__.py"),
    ]
    if resolved_platform == "darwin":
        command.extend(["--osx-bundle-identifier", MACOS_BUNDLE_ID])
    return command


def expected_artifact_path(*, root: Path | None = None, platform_name: str | None = None) -> Path:
    resolved_root = root or project_root()
    resolved_platform = platform_name or sys.platform
    artifact_name = f"{APP_BUILD_NAME}.app" if resolved_platform == "darwin" else APP_BUILD_NAME
    return resolved_root / "dist" / artifact_name


def run_build(*, root: Path | None = None, python_executable: str | None = None) -> Path:
    resolved_root = root or project_root()
    subprocess.run(
        build_command(
            root=resolved_root,
            python_executable=python_executable,
        ),
        cwd=resolved_root,
        check=True,
    )
    return expected_artifact_path(root=resolved_root)


def main() -> int:
    artifact_path = run_build()
    print(f"Built {artifact_path}")
    return 0

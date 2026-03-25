from __future__ import annotations

import argparse
import os
import subprocess
import sys
from pathlib import Path

from cloudsprocket.config import APP_NAME

APP_BUILD_NAME = APP_NAME
MACOS_BUNDLE_ID = "com.cloudsprocket.app"


def project_root() -> Path:
    return Path(__file__).resolve().parents[2]


def _resolve_build_path(path: Path | None, *, root: Path) -> Path | None:
    if path is None:
        return None
    return path if path.is_absolute() else root / path


def windows_version_file(*, root: Path | None = None) -> Path:
    resolved_root = root or project_root()
    return resolved_root / "src" / "cloudsprocket" / "resources" / "windows_version_info.txt"


def distribution_path(*, root: Path | None = None, dist_path: Path | None = None) -> Path:
    resolved_root = root or project_root()
    resolved_dist_root = _resolve_build_path(dist_path, root=resolved_root) or (resolved_root / "dist")
    return resolved_dist_root / APP_BUILD_NAME


def build_command(
    *,
    root: Path | None = None,
    python_executable: str | None = None,
    platform_name: str | None = None,
    dist_path: Path | None = None,
    work_path: Path | None = None,
    spec_path: Path | None = None,
) -> list[str]:
    resolved_root = root or project_root()
    resolved_platform = platform_name or sys.platform
    resolved_python = python_executable or sys.executable
    resolved_dist_path = _resolve_build_path(dist_path, root=resolved_root)
    resolved_work_path = _resolve_build_path(work_path, root=resolved_root)
    resolved_spec_path = _resolve_build_path(spec_path, root=resolved_root) or (
        resolved_root / "build" / "pyinstaller"
    )

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
        str(resolved_spec_path),
        str(resolved_root / "src" / "cloudsprocket" / "__main__.py"),
    ]
    if resolved_work_path is not None:
        command.extend(["--workpath", str(resolved_work_path)])
    if resolved_dist_path is not None:
        command.extend(["--distpath", str(resolved_dist_path)])
    if resolved_platform == "darwin":
        command.extend(["--osx-bundle-identifier", MACOS_BUNDLE_ID])
    if resolved_platform.startswith("win"):
        command.extend(["--version-file", str(windows_version_file(root=resolved_root))])
    return command


def expected_artifact_path(
    *,
    root: Path | None = None,
    platform_name: str | None = None,
    dist_path: Path | None = None,
) -> Path:
    resolved_platform = platform_name or sys.platform
    resolved_dist_path = distribution_path(root=root, dist_path=dist_path)
    if resolved_platform == "darwin":
        return resolved_dist_path.with_suffix(".app")
    executable_name = f"{APP_BUILD_NAME}.exe" if resolved_platform.startswith("win") else APP_BUILD_NAME
    return resolved_dist_path / executable_name


def run_build(
    *,
    root: Path | None = None,
    python_executable: str | None = None,
    dist_path: Path | None = None,
    work_path: Path | None = None,
    spec_path: Path | None = None,
    temp_dir: Path | None = None,
) -> Path:
    resolved_root = root or project_root()
    resolved_temp_dir = _resolve_build_path(temp_dir, root=resolved_root)
    env = os.environ.copy()
    if resolved_temp_dir is not None:
        env["TMP"] = str(resolved_temp_dir)
        env["TEMP"] = str(resolved_temp_dir)
    subprocess.run(
        build_command(
            root=resolved_root,
            python_executable=python_executable,
            dist_path=dist_path,
            work_path=work_path,
            spec_path=spec_path,
        ),
        cwd=resolved_root,
        check=True,
        env=env,
    )
    return expected_artifact_path(root=resolved_root, dist_path=dist_path)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Build the CloudSprocket desktop application.")
    parser.add_argument("--python-executable")
    parser.add_argument("--distpath", type=Path)
    parser.add_argument("--workpath", type=Path)
    parser.add_argument("--specpath", type=Path)
    parser.add_argument("--temp-dir", type=Path, dest="temp_dir")
    args = parser.parse_args(argv)

    artifact_path = run_build(
        python_executable=args.python_executable,
        dist_path=args.distpath,
        work_path=args.workpath,
        spec_path=args.specpath,
        temp_dir=args.temp_dir,
    )
    print(f"Built {artifact_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

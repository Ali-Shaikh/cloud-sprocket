from pathlib import Path

from cloudsprocket.build import (
    APP_BUILD_NAME,
    MACOS_BUNDLE_ID,
    build_command,
    distribution_path,
    expected_artifact_path,
    windows_version_file,
)


def test_build_command_uses_project_paths(tmp_path: Path) -> None:
    root = tmp_path

    command = build_command(
        root=root,
        python_executable="python-test",
        platform_name="win32",
    )

    assert command[:3] == ["python-test", "-m", "PyInstaller"]
    assert "--windowed" in command
    assert str(root / "src") in command
    assert str(root / "build" / "pyinstaller") in command
    assert str(root / "src" / "cloudsprocket" / "__main__.py") in command
    assert "--version-file" in command
    assert str(windows_version_file(root=root)) in command
    assert "--osx-bundle-identifier" not in command


def test_build_command_adds_macos_bundle_identifier(tmp_path: Path) -> None:
    root = tmp_path

    command = build_command(
        root=root,
        python_executable="python-test",
        platform_name="darwin",
    )

    assert "--osx-bundle-identifier" in command
    assert MACOS_BUNDLE_ID in command


def test_expected_artifact_path_varies_by_platform(tmp_path: Path) -> None:
    root = tmp_path

    assert distribution_path(root=root) == root / "dist" / APP_BUILD_NAME
    assert expected_artifact_path(root=root, platform_name="win32") == root / "dist" / APP_BUILD_NAME / f"{APP_BUILD_NAME}.exe"
    assert expected_artifact_path(root=root, platform_name="darwin") == root / "dist" / f"{APP_BUILD_NAME}.app"
    assert expected_artifact_path(root=root, platform_name="linux") == root / "dist" / APP_BUILD_NAME / APP_BUILD_NAME

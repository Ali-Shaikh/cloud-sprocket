from pathlib import Path

from cloudsprocket.config import AppSettings


def test_settings_use_override_paths(tmp_path: Path) -> None:
    home_dir = tmp_path / "home"
    appdata_dir = tmp_path / "appdata"
    local_appdata_dir = tmp_path / "local-appdata"
    config_dir = tmp_path / "config-root"

    settings = AppSettings.from_env(
        home_dir=home_dir,
        appdata_dir=appdata_dir,
        local_appdata_dir=local_appdata_dir,
        config_dir=config_dir,
    )

    assert settings.aws_config_path == home_dir / ".aws" / "config"
    assert settings.azure_profile_path == home_dir / ".azure" / "azureProfile.json"
    assert settings.gcloud_config_dir == appdata_dir / "gcloud" / "configurations"
    assert settings.app_profile_dir == config_dir / "profiles"


def test_settings_use_macos_defaults(tmp_path: Path) -> None:
    home_dir = tmp_path / "home"

    settings = AppSettings.from_env(
        env={},
        platform_name="darwin",
        home_dir=home_dir,
    )

    assert settings.platform_name == "macos"
    assert settings.appdata_dir == home_dir / "Library" / "Application Support"
    assert settings.local_appdata_dir == home_dir / "Library" / "Caches"
    assert settings.config_dir == home_dir / "Library" / "Application Support" / "CloudSprocket"
    assert settings.gcloud_dir == home_dir / ".config" / "gcloud"
    assert settings.gcloud_config_dir == home_dir / ".config" / "gcloud" / "configurations"


def test_settings_create_runtime_dirs(tmp_path: Path) -> None:
    settings = AppSettings.from_env(
        home_dir=tmp_path / "home",
        appdata_dir=tmp_path / "appdata",
        local_appdata_dir=tmp_path / "local-appdata",
        config_dir=tmp_path / "config-root",
    )

    settings.ensure_runtime_dirs()

    assert settings.config_dir.is_dir()
    assert settings.app_profile_dir.is_dir()

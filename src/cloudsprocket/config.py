from __future__ import annotations

import os
import sys
from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path

APP_NAME = "CloudSprocket"
ORGANIZATION_NAME = "CloudSprocket"


def _resolve_path(raw_value: str | None, fallback: Path) -> Path:
    if not raw_value:
        return fallback
    return Path(raw_value).expanduser()


def _normalize_platform(platform_name: str | None) -> str:
    candidate = (platform_name or sys.platform).lower()
    if candidate.startswith("win"):
        return "windows"
    if candidate == "darwin":
        return "macos"
    return "linux"


@dataclass(frozen=True, slots=True)
class AppSettings:
    app_name: str
    organization_name: str
    platform_name: str
    home_dir: Path
    appdata_dir: Path
    local_appdata_dir: Path
    config_dir: Path
    aws_config_path: Path
    aws_credentials_path: Path
    azure_dir: Path
    gcloud_dir: Path

    @classmethod
    def from_env(
        cls,
        *,
        env: Mapping[str, str] | None = None,
        platform_name: str | None = None,
        home_dir: Path | None = None,
        appdata_dir: Path | None = None,
        local_appdata_dir: Path | None = None,
        config_dir: Path | None = None,
        aws_config_path: Path | None = None,
        aws_credentials_path: Path | None = None,
        azure_dir: Path | None = None,
        gcloud_dir: Path | None = None,
    ) -> "AppSettings":
        env_values = os.environ if env is None else env
        normalized_platform = _normalize_platform(platform_name)
        home = home_dir or Path.home()

        if normalized_platform == "windows":
            default_appdata = home / "AppData" / "Roaming"
            default_local_appdata = home / "AppData" / "Local"
            default_config_dir = default_local_appdata / APP_NAME
            default_gcloud_dir = default_appdata / "gcloud"
        elif normalized_platform == "macos":
            default_appdata = home / "Library" / "Application Support"
            default_local_appdata = home / "Library" / "Caches"
            default_config_dir = default_appdata / APP_NAME
            default_gcloud_dir = home / ".config" / "gcloud"
        else:
            default_appdata = home / ".config"
            default_local_appdata = home / ".cache"
            default_config_dir = default_appdata / APP_NAME.lower()
            default_gcloud_dir = default_appdata / "gcloud"

        appdata = appdata_dir or _resolve_path(
            env_values.get("APPDATA") if normalized_platform == "windows" else env_values.get("XDG_CONFIG_HOME"),
            default_appdata,
        )
        local_appdata = local_appdata_dir or _resolve_path(
            env_values.get("LOCALAPPDATA") if normalized_platform == "windows" else env_values.get("XDG_CACHE_HOME"),
            default_local_appdata,
        )

        if normalized_platform == "windows":
            default_config_dir = local_appdata / APP_NAME
            default_gcloud_dir = appdata / "gcloud"
        elif normalized_platform == "macos":
            default_config_dir = appdata / APP_NAME
            default_gcloud_dir = home / ".config" / "gcloud"
        else:
            default_config_dir = appdata / APP_NAME.lower()
            default_gcloud_dir = appdata / "gcloud"

        resolved_config_dir = config_dir or _resolve_path(
            env_values.get("CLOUDSPROCKET_CONFIG_DIR"),
            default_config_dir,
        )
        resolved_aws_config_path = aws_config_path or _resolve_path(
            env_values.get("AWS_CONFIG_FILE"),
            home / ".aws" / "config",
        )
        resolved_aws_credentials_path = aws_credentials_path or _resolve_path(
            env_values.get("AWS_SHARED_CREDENTIALS_FILE"),
            home / ".aws" / "credentials",
        )
        resolved_azure_dir = azure_dir or _resolve_path(
            env_values.get("AZURE_CONFIG_DIR"),
            home / ".azure",
        )
        resolved_gcloud_dir = gcloud_dir or _resolve_path(
            env_values.get("CLOUDSDK_CONFIG"),
            default_gcloud_dir,
        )
        return cls(
            app_name=APP_NAME,
            organization_name=ORGANIZATION_NAME,
            platform_name=normalized_platform,
            home_dir=home,
            appdata_dir=appdata,
            local_appdata_dir=local_appdata,
            config_dir=resolved_config_dir,
            aws_config_path=resolved_aws_config_path,
            aws_credentials_path=resolved_aws_credentials_path,
            azure_dir=resolved_azure_dir,
            gcloud_dir=resolved_gcloud_dir,
        )

    @property
    def aws_dir(self) -> Path:
        return self.aws_config_path.parent

    @property
    def azure_profile_path(self) -> Path:
        return self.azure_dir / "azureProfile.json"

    @property
    def gcloud_config_dir(self) -> Path:
        return self.gcloud_dir / "configurations"

    @property
    def app_profile_dir(self) -> Path:
        return self.config_dir / "profiles"

    def ensure_runtime_dirs(self) -> None:
        self.config_dir.mkdir(parents=True, exist_ok=True)
        self.app_profile_dir.mkdir(parents=True, exist_ok=True)

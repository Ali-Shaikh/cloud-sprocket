from __future__ import annotations

import logging
from pathlib import Path

from cloudsprocket.config import AppSettings
from cloudsprocket.services.debug_logging import (
    configure_logging,
    log_shutdown,
    log_startup_context,
    log_window_ready,
    shutdown_logging,
)


def _make_settings(tmp_path: Path, config_dir: Path | None = None) -> AppSettings:
    return AppSettings.from_env(
        home_dir=tmp_path / "home",
        appdata_dir=tmp_path / "appdata",
        local_appdata_dir=tmp_path / "local-appdata",
        config_dir=config_dir or (tmp_path / "config-root"),
    )


def test_configure_logging_enables_debug_level_and_rotating_file(tmp_path: Path) -> None:
    settings = _make_settings(tmp_path)

    setup = configure_logging(settings, env={"CLOUDSPROCKET_DEBUG": "1"})
    try:
        assert setup.level == logging.DEBUG
        assert setup.file_logging_enabled
        assert setup.log_file_path == settings.config_dir / "logs" / "cloudsprocket.log"

        log = logging.getLogger("cloudsprocket.bootstrap")
        log_startup_context(settings=settings, argv=["cloudsprocket", "--test"])
        log_window_ready("CloudSprocket by Ali Shaikh")
        log_shutdown(0)
        log.debug("debug probe")

        for handler in logging.getLogger().handlers:
            if hasattr(handler, "flush"):
                handler.flush()

        contents = setup.log_file_path.read_text(encoding="utf-8")
        assert "Starting CloudSprocket by Ali Shaikh." in contents
        assert "Configuration root set to" in contents
        assert "Main window ready: CloudSprocket by Ali Shaikh." in contents
        assert "CloudSprocket exited with code 0." in contents
        assert "debug probe" in contents
    finally:
        shutdown_logging()


def test_configure_logging_falls_back_when_log_directory_cannot_be_created(tmp_path: Path) -> None:
    blocked_config_dir = tmp_path / "blocked-config"
    blocked_config_dir.write_text("not a directory", encoding="utf-8")
    settings = _make_settings(tmp_path, config_dir=blocked_config_dir)

    setup = configure_logging(settings)
    try:
        assert setup.level == logging.INFO
        assert not setup.file_logging_enabled
        assert not setup.log_file_path.exists()
        assert any(
            type(handler).__name__ == "StreamHandler"
            for handler in logging.getLogger().handlers
        )
        assert not any(
            type(handler).__name__ == "RotatingFileHandler"
            for handler in logging.getLogger().handlers
        )
    finally:
        shutdown_logging()

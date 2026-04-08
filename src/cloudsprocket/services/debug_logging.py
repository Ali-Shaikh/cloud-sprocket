from __future__ import annotations

import logging
import os
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from logging.handlers import RotatingFileHandler
from pathlib import Path

from cloudsprocket.config import AppSettings

LOG_FILE_NAME = "cloudsprocket.log"
LOG_DIR_NAME = "logs"
LOG_MAX_BYTES = 1_048_576
LOG_BACKUP_COUNT = 3
LOG_FORMAT = "%(asctime)s %(levelname)s %(module)s %(message)s"
LOG_DATE_FORMAT = "%Y-%m-%d %H:%M:%S"
_HANDLER_MARK = "_cloudsprocket_managed_handler"


@dataclass(frozen=True, slots=True)
class LoggingSetup:
    level: int
    log_file_path: Path
    file_logging_enabled: bool


def configure_logging(
    settings: AppSettings,
    *,
    env: Mapping[str, str] | None = None,
) -> LoggingSetup:
    env_values = os.environ if env is None else env
    debug_enabled = env_values.get("CLOUDSPROCKET_DEBUG", "").strip() == "1"
    level = logging.DEBUG if debug_enabled else logging.INFO

    root_logger = logging.getLogger()
    _remove_managed_handlers(root_logger)
    root_logger.setLevel(level)

    formatter = logging.Formatter(LOG_FORMAT, datefmt=LOG_DATE_FORMAT)

    console_handler = logging.StreamHandler()
    console_handler.setLevel(level)
    console_handler.setFormatter(formatter)
    setattr(console_handler, _HANDLER_MARK, True)
    root_logger.addHandler(console_handler)

    log_file_path = settings.config_dir / LOG_DIR_NAME / LOG_FILE_NAME
    file_logging_enabled = False
    try:
        log_file_path.parent.mkdir(parents=True, exist_ok=True)
        file_handler = RotatingFileHandler(
            log_file_path,
            maxBytes=LOG_MAX_BYTES,
            backupCount=LOG_BACKUP_COUNT,
            encoding="utf-8",
            delay=True,
        )
        file_handler.setLevel(level)
        file_handler.setFormatter(formatter)
        setattr(file_handler, _HANDLER_MARK, True)
        root_logger.addHandler(file_handler)
        file_logging_enabled = True
    except OSError:
        file_logging_enabled = False

    bootstrap_logger = logging.getLogger("cloudsprocket.bootstrap")
    bootstrap_logger.debug(
        "Logging configured for %s at level %s.",
        settings.app_brand_name,
        logging.getLevelName(level),
    )
    if file_logging_enabled:
        bootstrap_logger.debug("File logging enabled at %s.", log_file_path)
    else:
        bootstrap_logger.debug("File logging unavailable, continuing with console logging only.")

    return LoggingSetup(
        level=level,
        log_file_path=log_file_path,
        file_logging_enabled=file_logging_enabled,
    )


def log_startup_context(
    *,
    settings: AppSettings,
    argv: Sequence[str] | None = None,
) -> None:
    logger = logging.getLogger("cloudsprocket.bootstrap")
    logger.info("Starting %s.", settings.app_brand_name)
    logger.info("Platform resolved as %s.", settings.platform_name)
    logger.info("Configuration root set to %s.", settings.config_dir)
    logger.debug("Command line arguments: %s", list(argv or ()))
    logger.debug("AWS config path: %s", settings.aws_config_path)
    logger.debug("Azure profile path: %s", settings.azure_profile_path)
    logger.debug("GCloud config dir: %s", settings.gcloud_config_dir)


def log_window_ready(window_title: str) -> None:
    logging.getLogger("cloudsprocket.bootstrap").info("Main window ready: %s.", window_title)


def log_shutdown(exit_code: int) -> None:
    logging.getLogger("cloudsprocket.bootstrap").info(
        "CloudSprocket exited with code %s.",
        exit_code,
    )


def shutdown_logging() -> None:
    _remove_managed_handlers(logging.getLogger())


def _remove_managed_handlers(root_logger: logging.Logger) -> None:
    for handler in list(root_logger.handlers):
        if getattr(handler, _HANDLER_MARK, False):
            root_logger.removeHandler(handler)
            try:
                handler.close()
            except Exception:
                pass

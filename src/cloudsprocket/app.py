from __future__ import annotations

from collections.abc import Sequence
import logging

from PySide6.QtWidgets import QApplication

try:
    from qfluentwidgets import Theme, setTheme, setThemeColor
except ImportError:
    Theme = None  # type: ignore[assignment]
    setTheme = None  # type: ignore[assignment]
    setThemeColor = None  # type: ignore[assignment]

from cloudsprocket.config import AppSettings
from cloudsprocket.services.app_controller import CloudSprocketController
from cloudsprocket.services.auth import AuthStatusService
from cloudsprocket.services.debug_logging import (
    configure_logging,
    log_shutdown,
    log_startup_context,
    log_window_ready,
    shutdown_logging,
)
from cloudsprocket.services.profile_discovery import ProfileDiscoveryService
from cloudsprocket.ui.main_window import MainWindow


def create_application(
    argv: Sequence[str] | None = None,
    *,
    settings: AppSettings | None = None,
) -> QApplication:
    app = QApplication.instance()
    if app is None:
        app = QApplication(list(argv or []))

    resolved_settings = settings or AppSettings.from_env()
    app.setApplicationName(resolved_settings.app_name)
    if hasattr(app, "setApplicationDisplayName"):
        app.setApplicationDisplayName(resolved_settings.app_brand_name)
    app.setOrganizationName(resolved_settings.organization_name)
    if setTheme is not None and setThemeColor is not None and Theme is not None:
        try:
            setTheme(Theme.LIGHT)
            setThemeColor("#0f6cbd")
        except Exception:
            pass
    return app


def create_main_window(settings: AppSettings | None = None) -> MainWindow:
    resolved_settings = settings or AppSettings.from_env()
    resolved_settings.ensure_runtime_dirs()
    controller = CloudSprocketController(
        settings=resolved_settings,
        auth_service=AuthStatusService(resolved_settings),
        profile_discovery=ProfileDiscoveryService(resolved_settings),
    )
    return MainWindow(
        settings=resolved_settings,
        controller=controller,
    )


def main(argv: Sequence[str] | None = None) -> int:
    settings = AppSettings.from_env()
    logging_setup = configure_logging(settings)
    log_startup_context(settings=settings, argv=argv)
    bootstrap_logger = logging.getLogger("cloudsprocket.bootstrap")
    bootstrap_logger.debug(
        "Logging output target: %s (%s).",
        logging_setup.log_file_path,
        "enabled" if logging_setup.file_logging_enabled else "console only",
    )

    app = create_application(argv, settings=settings)
    bootstrap_logger.info("Application shell initialised.")
    window = create_main_window(settings)
    log_window_ready(window.windowTitle())
    window.show()
    bootstrap_logger.info("Main window shown.")
    exit_code = app.exec()
    log_shutdown(exit_code)
    shutdown_logging()
    return exit_code

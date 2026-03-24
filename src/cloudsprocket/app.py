from __future__ import annotations

from collections.abc import Sequence

from PySide6.QtWidgets import QApplication

from cloudsprocket.config import AppSettings
from cloudsprocket.services.auth import AuthStatusService
from cloudsprocket.services.profile_discovery import ProfileDiscoveryService
from cloudsprocket.ui.main_window import MainWindow


def create_application(argv: Sequence[str] | None = None) -> QApplication:
    app = QApplication.instance()
    if app is None:
        app = QApplication(list(argv or []))

    settings = AppSettings.from_env()
    app.setApplicationName(settings.app_name)
    app.setOrganizationName(settings.organization_name)
    return app


def create_main_window(settings: AppSettings | None = None) -> MainWindow:
    resolved_settings = settings or AppSettings.from_env()
    resolved_settings.ensure_runtime_dirs()
    return MainWindow(
        settings=resolved_settings,
        auth_service=AuthStatusService(resolved_settings),
        profile_discovery=ProfileDiscoveryService(resolved_settings),
    )


def main(argv: Sequence[str] | None = None) -> int:
    app = create_application(argv)
    window = create_main_window()
    window.show()
    return app.exec()


from __future__ import annotations

from collections.abc import Sequence

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
from cloudsprocket.services.profile_discovery import ProfileDiscoveryService
from cloudsprocket.ui.main_window import MainWindow


def create_application(argv: Sequence[str] | None = None) -> QApplication:
    app = QApplication.instance()
    if app is None:
        app = QApplication(list(argv or []))

    settings = AppSettings.from_env()
    app.setApplicationName(settings.app_name)
    if hasattr(app, "setApplicationDisplayName"):
        app.setApplicationDisplayName(settings.app_brand_name)
    app.setOrganizationName(settings.organization_name)
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
    app = create_application(argv)
    window = create_main_window()
    window.show()
    return app.exec()

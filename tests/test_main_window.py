from pathlib import Path

from cloudsprocket.config import AppSettings
from cloudsprocket.models import (
    DiscoveredProfile,
    DiscoveryReport,
    ProviderHealth,
    ProviderState,
)
from cloudsprocket.ui.main_window import MainWindow


class StaticAuthService:
    def snapshot(self) -> tuple[ProviderHealth, ...]:
        return (
            ProviderHealth(
                provider_id="aws",
                label="AWS",
                state=ProviderState.CONFIGURED,
                summary="Local credentials or profile data detected.",
            ),
        )


class StaticDiscoveryService:
    def discover(self) -> DiscoveryReport:
        return DiscoveryReport(
            profiles=(
                DiscoveredProfile(
                    provider_id="aws",
                    profile_id="sandbox",
                    display_name="sandbox",
                    source=Path("C:/Users/Ali/.aws/config"),
                    details="us-east-1",
                ),
            ),
        )


def test_main_window_populates_views(qapp, tmp_path: Path) -> None:
    settings = AppSettings.from_env(
        home_dir=tmp_path / "home",
        appdata_dir=tmp_path / "appdata",
        local_appdata_dir=tmp_path / "local-appdata",
        config_dir=tmp_path / "config-root",
    )

    window = MainWindow(
        settings=settings,
        auth_service=StaticAuthService(),
        profile_discovery=StaticDiscoveryService(),
    )

    assert window.windowTitle() == "CloudSprocket"
    assert window.auth_tree.topLevelItemCount() == 1
    assert window.profile_tree.topLevelItemCount() == 1
    assert "1 providers, 1 profiles" == window.statusBar().currentMessage()

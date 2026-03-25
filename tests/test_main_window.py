from pathlib import Path

from cloudsprocket.config import AppSettings
from cloudsprocket.models import DetailField, DiscoveredProfile, DiscoveryReport, ProviderHealth, ProviderState
from cloudsprocket.services.app_controller import CloudSprocketController
from cloudsprocket.ui.main_window import MainWindow


class StaticAuthService:
    def snapshot(self) -> tuple[ProviderHealth, ...]:
        return (
            ProviderHealth(
                provider_id="aws",
                label="AWS",
                state=ProviderState.CONFIGURED,
                summary="Local credentials or profile data detected.",
                command_path=Path("C:/Program Files/Amazon/AWSCLIV2/aws.exe"),
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
                    attributes=(
                        DetailField(label="region", value="us-east-1"),
                        DetailField(label="sso_start_url", value="https://example.awsapps.com/start"),
                    ),
                ),
                DiscoveredProfile(
                    provider_id="aws",
                    profile_id="prod",
                    display_name="prod",
                    source=Path("C:/Users/Ali/.aws/config"),
                    details="eu-west-1",
                    attributes=(DetailField(label="region", value="eu-west-1"),),
                ),
            )
        )


class FakeDesktopIntegration:
    def __init__(self) -> None:
        self.copied_texts: list[str] = []

    def open_path(self, path: str) -> bool:
        return True

    def copy_text(self, text: str) -> None:
        self.copied_texts.append(text)


class NoopRunner:
    def run(self, spec, on_finished) -> None:
        raise AssertionError("This test should not trigger process actions.")


def test_main_window_renders_branding_and_actions(qapp, tmp_path: Path) -> None:
    settings = AppSettings.from_env(
        home_dir=tmp_path / "home",
        appdata_dir=tmp_path / "appdata",
        local_appdata_dir=tmp_path / "local-appdata",
        config_dir=tmp_path / "config-root",
    )
    controller = CloudSprocketController(
        settings=settings,
        auth_service=StaticAuthService(),
        profile_discovery=StaticDiscoveryService(),
        command_runner=NoopRunner(),
        desktop_integration=FakeDesktopIntegration(),
    )

    window = MainWindow(settings=settings, controller=controller)

    assert window.windowTitle() == "CloudSprocket by Ali Shaikh"
    assert "Ali Shaikh" in window.about_text()
    assert {"refresh", "whoami", "sso-login", "logout", "activate", "open-config", "copy-export"} <= set(window.action_buttons)
    assert window.auth_methods_tree.topLevelItemCount() == 3


def test_main_window_selection_updates_details_and_log_panel(qapp, tmp_path: Path) -> None:
    settings = AppSettings.from_env(
        home_dir=tmp_path / "home",
        appdata_dir=tmp_path / "appdata",
        local_appdata_dir=tmp_path / "local-appdata",
        config_dir=tmp_path / "config-root",
    )
    desktop = FakeDesktopIntegration()
    controller = CloudSprocketController(
        settings=settings,
        auth_service=StaticAuthService(),
        profile_discovery=StaticDiscoveryService(),
        command_runner=NoopRunner(),
        desktop_integration=desktop,
    )
    window = MainWindow(settings=settings, controller=controller)

    second_item = window.profile_tree.topLevelItem(1)
    window.profile_tree.setCurrentItem(second_item)
    qapp.processEvents()

    assert controller.selected_profile().profile_id == "prod"
    assert window.detail_title_label.text() == "prod"

    window.action_buttons["copy-export"].click()
    qapp.processEvents()

    assert "Copied export snippet" in window.log_panel.toPlainText()
    assert "prod" in desktop.copied_texts[-1]

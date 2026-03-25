from pathlib import Path

from cloudsprocket.config import AppSettings
from cloudsprocket.models import (
    CommandExecutionType,
    CommandResult,
    DetailField,
    DiscoveredProfile,
    DiscoveryReport,
    ProviderHealth,
    ProviderState,
)
from cloudsprocket.services.app_controller import CloudSprocketController
from cloudsprocket.services.provider_actions import create_provider_adapters


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
            ProviderHealth(
                provider_id="azure",
                label="Azure",
                state=ProviderState.TOOLING_ONLY,
                summary="Azure CLI is installed, but no local profile data was found.",
            ),
        )


class StaticDiscoveryService:
    def __init__(self, profiles: tuple[DiscoveredProfile, ...]) -> None:
        self._profiles = profiles

    def discover(self) -> DiscoveryReport:
        return DiscoveryReport(profiles=self._profiles)


class FakeDesktopIntegration:
    def __init__(self) -> None:
        self.opened_paths: list[str] = []
        self.copied_texts: list[str] = []

    def open_path(self, path: str) -> bool:
        self.opened_paths.append(path)
        return True

    def copy_text(self, text: str) -> None:
        self.copied_texts.append(text)


class DeferredRunner:
    def __init__(self) -> None:
        self.calls: list[tuple[object, object]] = []

    def run(self, spec, on_finished) -> None:
        self.calls.append((spec, on_finished))

    def finish_next(self, result: CommandResult) -> None:
        spec, callback = self.calls.pop(0)
        callback(result)


class ImmediateRunner:
    def __init__(self, result_factory) -> None:
        self._result_factory = result_factory

    def run(self, spec, on_finished) -> None:
        on_finished(self._result_factory(spec))


def _make_settings(tmp_path: Path) -> AppSettings:
    return AppSettings.from_env(
        home_dir=tmp_path / "home",
        appdata_dir=tmp_path / "appdata",
        local_appdata_dir=tmp_path / "local-appdata",
        config_dir=tmp_path / "config-root",
    )


def _make_profiles() -> tuple[DiscoveredProfile, ...]:
    aws_profile = DiscoveredProfile(
        provider_id="aws",
        profile_id="sandbox",
        display_name="sandbox",
        source=Path("C:/Users/Ali/.aws/config"),
        details="us-east-1",
        source_paths=(Path("C:/Users/Ali/.aws/config"), Path("C:/Users/Ali/.aws/credentials")),
        attributes=(
            DetailField(label="region", value="us-east-1"),
            DetailField(label="sso_start_url", value="https://example.awsapps.com/start"),
        ),
    )
    return (aws_profile,)


def test_controller_activate_and_copy_export_snippet(tmp_path: Path) -> None:
    desktop = FakeDesktopIntegration()
    settings = _make_settings(tmp_path)
    controller = CloudSprocketController(
        settings=settings,
        auth_service=StaticAuthService(),
        profile_discovery=StaticDiscoveryService(_make_profiles()),
        provider_adapters=create_provider_adapters(settings),
        command_runner=DeferredRunner(),
        desktop_integration=desktop,
    )

    assert controller.trigger_action("activate")
    assert controller.session_state.active_profile_by_provider["aws"] == "sandbox"

    assert controller.trigger_action("copy-export")
    assert "AWS_PROFILE" in desktop.copied_texts[-1]
    assert "sandbox" in desktop.copied_texts[-1]

    actions = {action.action_id: action for action in controller.available_actions()}
    assert not actions["activate"].enabled


def test_controller_process_action_transitions_busy_state_and_records_output(tmp_path: Path) -> None:
    desktop = FakeDesktopIntegration()
    runner = DeferredRunner()
    controller = CloudSprocketController(
        settings=_make_settings(tmp_path),
        auth_service=StaticAuthService(),
        profile_discovery=StaticDiscoveryService(_make_profiles()),
        command_runner=runner,
        desktop_integration=desktop,
    )

    assert controller.trigger_action("whoami")
    assert controller.session_state.command_state.value == "running"
    spec, _callback = runner.calls[0]
    assert spec.execution_type == CommandExecutionType.PROCESS
    assert spec.args[:3] == ("sts", "get-caller-identity", "--profile")

    runner.finish_next(
        CommandResult(
            spec=spec,
            exit_code=0,
            stdout='{"Account":"123456789012","Arn":"arn:aws:sts::123456789012:assumed-role/Admin"}',
            summary="identity",
            succeeded=True,
        )
    )

    assert controller.session_state.command_state.value == "idle"
    assert "123456789012" in controller.log_entries()[-1].message


def test_controller_records_failed_process_result(tmp_path: Path) -> None:
    desktop = FakeDesktopIntegration()
    controller = CloudSprocketController(
        settings=_make_settings(tmp_path),
        auth_service=StaticAuthService(),
        profile_discovery=StaticDiscoveryService(_make_profiles()),
        command_runner=ImmediateRunner(
            lambda spec: CommandResult(
                spec=spec,
                exit_code=255,
                stderr="The SSO session has expired.",
                summary="logout",
                succeeded=False,
            )
        ),
        desktop_integration=desktop,
    )

    assert controller.trigger_action("logout")
    last_log = controller.log_entries()[-1]
    assert last_log.level.value == "error"
    assert "expired" in last_log.message.lower()

from pathlib import Path

from cloudsprocket.config import AppSettings
from cloudsprocket.models import (
    AuthMethod,
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


def _make_mixed_aws_profiles() -> tuple[DiscoveredProfile, ...]:
    non_sso_profile = DiscoveredProfile(
        provider_id="aws",
        profile_id="default",
        display_name="default",
        source=Path("C:/Users/Ali/.aws/config"),
        details="us-east-1",
        source_paths=(Path("C:/Users/Ali/.aws/config"),),
        attributes=(DetailField(label="region", value="us-east-1"),),
    )
    sso_profile = DiscoveredProfile(
        provider_id="aws",
        profile_id="sandbox-sso",
        display_name="sandbox-sso",
        source=Path("C:/Users/Ali/.aws/config"),
        details="eu-west-1",
        source_paths=(Path("C:/Users/Ali/.aws/config"), Path("C:/Users/Ali/.aws/credentials")),
        attributes=(
            DetailField(label="region", value="eu-west-1"),
            DetailField(label="sso_start_url", value="https://example.awsapps.com/start"),
        ),
    )
    return (non_sso_profile, sso_profile)


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


def test_controller_keeps_global_logout_available_when_another_sso_profile_exists(tmp_path: Path) -> None:
    controller = CloudSprocketController(
        settings=_make_settings(tmp_path),
        auth_service=StaticAuthService(),
        profile_discovery=StaticDiscoveryService(_make_mixed_aws_profiles()),
        command_runner=DeferredRunner(),
        desktop_integration=FakeDesktopIntegration(),
    )

    controller.select_profile("aws", "default")
    actions = {action.action_id: action for action in controller.available_actions()}

    assert not actions["sso-login"].enabled
    assert actions["logout"].enabled
    assert actions["logout"].label == "Global SSO Logout"


def test_controller_tracks_selected_auth_method_and_locked_workspace_tabs(tmp_path: Path) -> None:
    controller = CloudSprocketController(
        settings=_make_settings(tmp_path),
        auth_service=StaticAuthService(),
        profile_discovery=StaticDiscoveryService(_make_profiles()),
        command_runner=DeferredRunner(),
        desktop_integration=FakeDesktopIntegration(),
    )

    assert controller.selected_auth_method() == AuthMethod.CLI
    assert controller.select_auth_method(AuthMethod.SSO)
    assert controller.lock_session()
    assert controller.is_session_locked()
    assert controller.session_state.locked_auth_method == AuthMethod.SSO
    assert [tab.label for tab in controller.workspace_tabs()] == [
        "Overview",
        "S3",
        "EC2",
        "IAM",
        "CloudWatch",
        "Actions",
    ]

    controller.unlock_session()

    assert not controller.is_session_locked()
    assert controller.workspace_tabs() == ()


def test_controller_rejects_unavailable_auth_method_selection(tmp_path: Path) -> None:
    controller = CloudSprocketController(
        settings=_make_settings(tmp_path),
        auth_service=StaticAuthService(),
        profile_discovery=StaticDiscoveryService(_make_mixed_aws_profiles()),
        command_runner=DeferredRunner(),
        desktop_integration=FakeDesktopIntegration(),
    )

    controller.select_profile("aws", "default")

    assert not controller.select_auth_method(AuthMethod.SSO)
    assert controller.selected_auth_method() == AuthMethod.CLI


def test_controller_loads_s3_buckets_and_objects_for_locked_aws_session(tmp_path: Path) -> None:
    runner = DeferredRunner()
    controller = CloudSprocketController(
        settings=_make_settings(tmp_path),
        auth_service=StaticAuthService(),
        profile_discovery=StaticDiscoveryService(_make_profiles()),
        command_runner=runner,
        desktop_integration=FakeDesktopIntegration(),
    )

    assert controller.lock_session()
    assert controller.refresh_aws_s3_buckets()

    bucket_spec, _callback = runner.calls[0]
    assert bucket_spec.execution_type == CommandExecutionType.PROCESS
    assert bucket_spec.args[:2] == ("s3api", "list-buckets")

    runner.finish_next(
        CommandResult(
            spec=bucket_spec,
            exit_code=0,
            stdout='{"Buckets":[{"Name":"alpha","CreationDate":"2026-03-24T10:00:00Z"},{"Name":"zulu","CreationDate":"2026-03-25T12:30:00Z"}]}',
            summary="buckets",
            succeeded=True,
        )
    )

    object_spec, _callback = runner.calls[0]
    assert object_spec.args[:2] == ("s3api", "list-objects-v2")
    assert ("--bucket", "alpha") == object_spec.args[2:4]

    runner.finish_next(
        CommandResult(
            spec=object_spec,
            exit_code=0,
            stdout='{"Contents":[{"Key":"logs/app.log","Size":1024,"LastModified":"2026-03-25T08:15:00Z","StorageClass":"STANDARD"}]}',
            summary="objects",
            succeeded=True,
        )
    )

    state = controller.aws_s3_workspace()
    assert [bucket.name for bucket in state.buckets] == ["alpha", "zulu"]
    assert state.selected_bucket_name == "alpha"
    assert [obj.key for obj in state.objects] == ["logs/app.log"]
    assert state.objects[0].size == "1.0 KiB"


def test_controller_blocks_s3_browsing_for_local_files_locked_session(tmp_path: Path) -> None:
    controller = CloudSprocketController(
        settings=_make_settings(tmp_path),
        auth_service=StaticAuthService(),
        profile_discovery=StaticDiscoveryService(_make_profiles()),
        command_runner=DeferredRunner(),
        desktop_integration=FakeDesktopIntegration(),
    )

    assert controller.select_auth_method(AuthMethod.LOCAL_FILES)
    assert controller.lock_session()

    available, reason = controller.aws_s3_availability()

    assert not available
    assert "CLI or SSO" in reason
    assert not controller.refresh_aws_s3_buckets()

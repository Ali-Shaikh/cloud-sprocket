from pathlib import Path

from cloudsprocket.config import AppSettings
from cloudsprocket.models import DetailField, DiscoveredProfile, ProviderHealth, ProviderState, SessionState
from cloudsprocket.services.provider_actions import AwsProviderAdapter


def _make_settings(tmp_path: Path) -> AppSettings:
    return AppSettings.from_env(
        home_dir=tmp_path / "home",
        appdata_dir=tmp_path / "appdata",
        local_appdata_dir=tmp_path / "local-appdata",
        config_dir=tmp_path / "config-root",
    )


def _make_aws_profile(profile_id: str, *, with_sso: bool = True) -> DiscoveredProfile:
    attributes = [
        DetailField(label="region", value="us-east-1"),
    ]
    if with_sso:
        attributes.extend(
            [
                DetailField(label="sso_start_url", value="https://example.awsapps.com/start"),
                DetailField(label="sso_account_id", value="123456789012"),
                DetailField(label="sso_role_name", value="AdministratorAccess"),
            ]
        )
    return DiscoveredProfile(
        provider_id="aws",
        profile_id=profile_id,
        display_name=profile_id,
        source=Path.home() / ".aws" / "config",
        details="us-east-1",
        source_paths=(Path.home() / ".aws" / "config", Path.home() / ".aws" / "credentials"),
        attributes=tuple(attributes),
    )


def test_aws_actions_vary_by_cli_and_sso_state(tmp_path: Path) -> None:
    settings = _make_settings(tmp_path)
    adapter = AwsProviderAdapter(settings)
    session_state = SessionState(current_provider_id="aws", selected_profile_id="sandbox")
    sso_profile = _make_aws_profile("sandbox", with_sso=True)
    non_sso_profile = _make_aws_profile("sandbox", with_sso=False)
    alternate_sso_profile = _make_aws_profile("prod-sso", with_sso=True)

    missing_cli_health = ProviderHealth(
        provider_id="aws",
        label="AWS",
        state=ProviderState.CONFIGURED,
        summary="Local credentials detected.",
    )
    with_cli_health = ProviderHealth(
        provider_id="aws",
        label="AWS",
        state=ProviderState.CONFIGURED,
        summary="Local credentials detected.",
        command_path=Path("C:/Program Files/Amazon/AWSCLIV2/aws.exe"),
    )

    actions_without_cli = {
        action.action_id: action
        for action in adapter.list_actions(
            sso_profile,
            (sso_profile,),
            session_state,
            missing_cli_health,
        )
    }
    assert not actions_without_cli["whoami"].enabled
    assert not actions_without_cli["sso-login"].enabled
    assert actions_without_cli["copy-export"].enabled

    actions_with_cli = {
        action.action_id: action
        for action in adapter.list_actions(
            sso_profile,
            (sso_profile,),
            session_state,
            with_cli_health,
        )
    }
    assert actions_with_cli["whoami"].enabled
    assert actions_with_cli["sso-login"].enabled
    assert actions_with_cli["logout"].enabled
    assert actions_with_cli["logout"].label == "Global SSO Logout"

    actions_without_sso = {
        action.action_id: action
        for action in adapter.list_actions(
            non_sso_profile,
            (non_sso_profile,),
            session_state,
            with_cli_health,
        )
    }
    assert not actions_without_sso["sso-login"].enabled
    assert not actions_without_sso["logout"].enabled

    mixed_actions = {
        action.action_id: action
        for action in adapter.list_actions(
            non_sso_profile,
            (non_sso_profile, alternate_sso_profile),
            session_state,
            with_cli_health,
        )
    }
    assert not mixed_actions["sso-login"].enabled
    assert mixed_actions["logout"].enabled
    assert "across all AWS profiles" in mixed_actions["logout"].description


def test_aws_export_snippet_uses_selected_profile(tmp_path: Path) -> None:
    settings = _make_settings(tmp_path)
    adapter = AwsProviderAdapter(settings)
    session_state = SessionState(current_provider_id="aws", selected_profile_id="dev")
    profile = _make_aws_profile("dev")
    copy_action = next(
        action
        for action in adapter.list_actions(
            profile,
            (profile,),
            session_state,
            ProviderHealth(
                provider_id="aws",
                label="AWS",
                state=ProviderState.CONFIGURED,
                summary="Configured.",
                command_path=Path("/usr/bin/aws"),
            ),
        )
        if action.action_id == "copy-export"
    )

    spec = adapter.build_command(copy_action, profile, session_state)

    assert "AWS_PROFILE" in (spec.clipboard_text or "")
    assert "dev" in (spec.clipboard_text or "")
    assert "CloudSprocket by Ali Shaikh" in (spec.clipboard_text or "")


def test_aws_process_commands_disable_the_cli_pager(tmp_path: Path) -> None:
    settings = _make_settings(tmp_path)
    adapter = AwsProviderAdapter(settings)
    session_state = SessionState(current_provider_id="aws", selected_profile_id="sandbox")
    profile = _make_aws_profile("sandbox")

    health = ProviderHealth(
        provider_id="aws",
        label="AWS",
        state=ProviderState.CONFIGURED,
        summary="Configured.",
        command_path=Path("C:/Program Files/Amazon/AWSCLIV2/aws.exe"),
    )
    actions = {
        action.action_id: action
        for action in adapter.list_actions(profile, (profile,), session_state, health)
    }

    whoami_spec = adapter.build_command(actions["whoami"], profile, session_state)
    login_spec = adapter.build_command(actions["sso-login"], profile, session_state)
    logout_spec = adapter.build_command(actions["logout"], profile, session_state)

    assert "--no-cli-pager" in whoami_spec.args
    assert "--no-cli-pager" in login_spec.args
    assert "--no-cli-pager" in logout_spec.args

from pathlib import Path

from cloudsprocket.config import AppSettings
from cloudsprocket.services.auth import AuthStatusService
from cloudsprocket.services.profile_discovery import ProfileDiscoveryService


def test_auth_status_prefers_local_config(tmp_path: Path) -> None:
    settings = AppSettings.from_env(
        home_dir=tmp_path / "home",
        appdata_dir=tmp_path / "appdata",
        local_appdata_dir=tmp_path / "local-appdata",
        config_dir=tmp_path / "config-root",
    )
    settings.aws_dir.mkdir(parents=True)
    settings.aws_config_path.write_text("[default]\nregion = us-east-1\n", encoding="utf-8")
    settings.azure_dir.mkdir(parents=True)
    settings.azure_profile_path.write_text('{"subscriptions": []}', encoding="utf-8")
    settings.gcloud_config_dir.mkdir(parents=True)

    service = AuthStatusService(settings, lookup_command=lambda _: None)
    snapshot = {provider.provider_id: provider for provider in service.snapshot()}

    assert snapshot["aws"].state.value == "configured"
    assert snapshot["azure"].state.value == "configured"
    assert snapshot["gcp"].state.value == "configured"


def test_profile_discovery_collects_aws_azure_and_gcp(tmp_path: Path) -> None:
    settings = AppSettings.from_env(
        home_dir=tmp_path / "home",
        appdata_dir=tmp_path / "appdata",
        local_appdata_dir=tmp_path / "local-appdata",
        config_dir=tmp_path / "config-root",
    )

    settings.aws_dir.mkdir(parents=True)
    settings.aws_config_path.write_text(
        "[default]\nregion = us-east-1\n\n[profile dev]\nregion = eu-west-1\n",
        encoding="utf-8",
    )
    settings.aws_credentials_path.write_text(
        "[default]\naws_access_key_id = one\n\n[dev]\naws_access_key_id = two\n",
        encoding="utf-8",
    )

    settings.azure_dir.mkdir(parents=True)
    settings.azure_profile_path.write_text(
        (
            '{"subscriptions": ['
            '{"id": "sub-001", "name": "Sandbox", "tenantId": "tenant-1", '
            '"user": {"name": "alice@example.com"}}'
            "]} "
        ),
        encoding="utf-8",
    )

    settings.gcloud_config_dir.mkdir(parents=True)
    (settings.gcloud_config_dir / "config_default").write_text(
        "[core]\naccount = alice@example.com\nproject = platform-dev\n",
        encoding="utf-8",
    )
    (settings.gcloud_config_dir / "config_team").write_text(
        "[core]\naccount = team@example.com\nproject = shared-team\n",
        encoding="utf-8",
    )

    report = ProfileDiscoveryService(settings).discover()

    discovered_keys = {(profile.provider_id, profile.profile_id) for profile in report.profiles}

    assert ("aws", "default") in discovered_keys
    assert ("aws", "dev") in discovered_keys
    assert ("azure", "sub-001") in discovered_keys
    assert ("gcp", "default") in discovered_keys
    assert ("gcp", "team") in discovered_keys
    assert not report.warnings


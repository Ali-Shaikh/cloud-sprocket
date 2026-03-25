from pathlib import Path

from PySide6.QtCore import Qt
from PySide6.QtWidgets import QHeaderView

from cloudsprocket.config import AppSettings
from cloudsprocket.models import (
    AuthMethod,
    CommandResult,
    DetailField,
    DiscoveredProfile,
    DiscoveryReport,
    ProviderHealth,
    ProviderState,
)
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
                        DetailField(
                            label="aws_secret_access_key",
                            value="super-secret-value",
                            sensitive=True,
                        ),
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


class DeferredRunner:
    def __init__(self) -> None:
        self.calls: list[tuple[object, object]] = []

    def run(self, spec, on_finished) -> None:
        self.calls.append((spec, on_finished))

    def finish_next(self, result: CommandResult) -> None:
        spec, callback = self.calls.pop(0)
        callback(result)


def _detail_value(window: MainWindow, label: str) -> str:
    return _detail_item(window, label).text(1)


def _detail_item(window: MainWindow, label: str):
    for index in range(window.detail_fields_tree.topLevelItemCount()):
        item = window.detail_fields_tree.topLevelItem(index)
        if item.text(0) == label:
            return item
    raise AssertionError(f"Missing detail field {label}")


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
    assert [window.session_tabs.tabText(index) for index in range(window.session_tabs.count())] == [
        "Profile",
        "Access",
        "Actions",
    ]
    assert "Provider-wide actions" in window.actions_hint_label.text()
    assert window.profile_actions_label.text() == "Selected Profile Actions: sandbox"
    assert window.global_actions_label.text() == "Provider-wide Actions"
    assert window.action_buttons["logout"].text() == "Global SSO Logout"
    assert window.action_buttons["logout"].parentWidget() is window.global_actions_container
    assert window.action_buttons["whoami"].parentWidget() is window.profile_actions_container


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


def test_main_window_masks_sensitive_fields_until_explicit_reveal(qapp, tmp_path: Path) -> None:
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
    secret_label = "Aws Secret Access Key"

    assert window.reveal_sensitive_button.isEnabled()
    assert _detail_value(window, secret_label) == "Hidden until revealed"
    assert "super-secret-value" not in _detail_item(window, secret_label).toolTip(1)

    window.reveal_sensitive_button.click()
    qapp.processEvents()

    assert _detail_value(window, secret_label) == "super-secret-value"

    second_item = window.profile_tree.topLevelItem(1)
    window.profile_tree.setCurrentItem(second_item)
    qapp.processEvents()

    assert not window.reveal_sensitive_button.isChecked()
    assert not window.reveal_sensitive_button.isEnabled()


def test_main_window_allows_resizing_detail_sections_and_field_columns(qapp, tmp_path: Path) -> None:
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

    assert window.detail_sections_splitter.orientation() == Qt.Vertical
    assert window.detail_sections_splitter.count() == 3
    assert window.detail_fields_tree.header().sectionResizeMode(0) == QHeaderView.Interactive
    assert window.detail_fields_tree.header().sectionResizeMode(1) == QHeaderView.Interactive


def test_main_window_switches_into_locked_workspace_tabs(qapp, tmp_path: Path) -> None:
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

    sso_item = window.auth_methods_tree.topLevelItem(1)
    window.auth_methods_tree.setCurrentItem(sso_item)
    qapp.processEvents()

    assert controller.selected_auth_method() == AuthMethod.SSO

    window.lock_session_button.click()
    qapp.processEvents()

    assert controller.is_session_locked()
    assert window.body_stack.currentIndex() == 1
    assert [window.workspace_tabs.tabText(index) for index in range(window.workspace_tabs.count())] == [
        "Overview",
        "S3",
        "EC2",
        "IAM",
        "CloudWatch",
        "Actions",
    ]
    assert {"refresh", "whoami", "sso-login", "logout", "activate", "open-config", "copy-export"} <= set(window.action_buttons)

    window.unlock_session_button.click()
    qapp.processEvents()

    assert not controller.is_session_locked()
    assert window.body_stack.currentIndex() == 0


def test_main_window_renders_loaded_s3_workspace_data(qapp, tmp_path: Path) -> None:
    settings = AppSettings.from_env(
        home_dir=tmp_path / "home",
        appdata_dir=tmp_path / "appdata",
        local_appdata_dir=tmp_path / "local-appdata",
        config_dir=tmp_path / "config-root",
    )
    runner = DeferredRunner()
    desktop = FakeDesktopIntegration()
    controller = CloudSprocketController(
        settings=settings,
        auth_service=StaticAuthService(),
        profile_discovery=StaticDiscoveryService(),
        command_runner=runner,
        desktop_integration=desktop,
    )
    window = MainWindow(settings=settings, controller=controller)

    window.lock_session_button.click()
    qapp.processEvents()
    window.workspace_s3_refresh_buckets_button.click()
    qapp.processEvents()

    bucket_spec, _callback = runner.calls[0]
    runner.finish_next(
        CommandResult(
            spec=bucket_spec,
            exit_code=0,
            stdout='{"Buckets":[{"Name":"alpha","CreationDate":"2026-03-24T10:00:00Z"},{"Name":"zulu","CreationDate":"2026-03-25T12:30:00Z"}]}',
            summary="buckets",
            succeeded=True,
        )
    )
    qapp.processEvents()

    object_spec, _callback = runner.calls[0]
    runner.finish_next(
        CommandResult(
            spec=object_spec,
            exit_code=0,
            stdout='{"Contents":[{"Key":"logs/app.log","Size":1024,"LastModified":"2026-03-25T08:15:00Z","StorageClass":"STANDARD","ETag":"\\"abc123\\""}]}',
            summary="objects",
            succeeded=True,
        )
    )
    qapp.processEvents()

    metadata_spec, _callback = runner.calls[0]
    runner.finish_next(
        CommandResult(
            spec=metadata_spec,
            exit_code=0,
            stdout='{"ContentLength":1024,"LastModified":"2026-03-25T08:15:00Z","ContentType":"text/plain","StorageClass":"STANDARD","ETag":"\\"abc123\\"","Metadata":{"env":"dev"}}',
            summary="head-object",
            succeeded=True,
        )
    )
    qapp.processEvents()

    assert window.workspace_s3_bucket_tree.topLevelItemCount() == 2
    assert window.workspace_s3_object_tree.topLevelItemCount() == 1
    assert window.workspace_s3_bucket_tree.topLevelItem(0).text(0) == "alpha"
    assert window.workspace_s3_object_tree.topLevelItem(0).text(0) == "logs/app.log"
    assert window.workspace_s3_object_details_tree.topLevelItemCount() >= 5

    window.workspace_s3_copy_uri_button.click()
    qapp.processEvents()

    assert desktop.copied_texts[-1] == "s3://alpha/logs/app.log"


def test_main_window_applies_s3_prefix_filter(qapp, tmp_path: Path) -> None:
    settings = AppSettings.from_env(
        home_dir=tmp_path / "home",
        appdata_dir=tmp_path / "appdata",
        local_appdata_dir=tmp_path / "local-appdata",
        config_dir=tmp_path / "config-root",
    )
    runner = DeferredRunner()
    controller = CloudSprocketController(
        settings=settings,
        auth_service=StaticAuthService(),
        profile_discovery=StaticDiscoveryService(),
        command_runner=runner,
        desktop_integration=FakeDesktopIntegration(),
    )
    window = MainWindow(settings=settings, controller=controller)

    window.lock_session_button.click()
    qapp.processEvents()
    window.workspace_s3_refresh_buckets_button.click()
    qapp.processEvents()

    bucket_spec, _callback = runner.calls[0]
    runner.finish_next(
        CommandResult(
            spec=bucket_spec,
            exit_code=0,
            stdout='{"Buckets":[{"Name":"alpha","CreationDate":"2026-03-24T10:00:00Z"}]}',
            summary="buckets",
            succeeded=True,
        )
    )
    qapp.processEvents()

    initial_object_spec, _callback = runner.calls[0]
    runner.finish_next(
        CommandResult(
            spec=initial_object_spec,
            exit_code=0,
            stdout='{"Contents":[]}',
            summary="objects",
            succeeded=True,
        )
    )
    qapp.processEvents()

    window.workspace_s3_prefix_input.setText("logs/2026/")
    window.workspace_s3_apply_prefix_button.click()
    qapp.processEvents()

    filtered_object_spec, _callback = runner.calls[0]
    assert "--prefix" in filtered_object_spec.args
    prefix_index = filtered_object_spec.args.index("--prefix")
    assert filtered_object_spec.args[prefix_index + 1] == "logs/2026/"

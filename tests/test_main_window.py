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
from cloudsprocket.services.url_tester import UrlValidationResult
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


class DeferredUrlValidator:
    def __init__(self) -> None:
        self.calls: list[tuple[str, object]] = []

    def run(self, url: str, on_finished) -> None:
        self.calls.append((url, on_finished))

    def finish_next(self, result: UrlValidationResult) -> None:
        _url, callback = self.calls.pop(0)
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
    assert [window.session_flow_tabs.tabText(index) for index in range(window.session_flow_tabs.count())] == [
        "Home",
        "Session Setup",
    ]
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
    assert "QTabBar::tab" in window.styleSheet()


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


def test_main_window_separates_control_and_activity_views(qapp, tmp_path: Path) -> None:
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

    assert window.primary_sections_tabs.count() == 2
    assert [window.primary_sections_tabs.tabText(index) for index in range(window.primary_sections_tabs.count())] == [
        "Control",
        "Activity",
    ]


def test_main_window_theme_defines_focus_states_and_primary_button_tone(qapp, tmp_path: Path) -> None:
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

    stylesheet = window.styleSheet()

    assert "QLineEdit:focus" in stylesheet
    assert 'QPushButton[tone="primary"]' in stylesheet
    assert window.lock_session_button.property("tone") == "primary"


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
        "Actions",
    ]
    assert {"refresh", "whoami", "sso-login", "logout", "activate", "open-config", "copy-export"} <= set(window.action_buttons)

    window.unlock_session_button.click()
    qapp.processEvents()

    assert not controller.is_session_locked()
    assert window.body_stack.currentIndex() == 0



def test_main_window_renders_ec2_workspace_and_instance_actions(qapp, tmp_path: Path) -> None:
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

    ec2_index = next(
        index for index in range(window.workspace_tabs.count()) if window.workspace_tabs.tabText(index) == "EC2"
    )
    window.workspace_tabs.setCurrentIndex(ec2_index)
    qapp.processEvents()

    window.workspace_ec2_refresh_button.click()
    qapp.processEvents()

    list_spec, _callback = runner.calls[0]
    assert list_spec.args[:2] == ("ec2", "describe-instances")

    runner.finish_next(
        CommandResult(
            spec=list_spec,
            exit_code=0,
            stdout=(
                '{"Reservations":[{"Instances":['
                '{"InstanceId":"i-001","InstanceType":"t3.small","State":{"Name":"running"},'
                '"Placement":{"AvailabilityZone":"eu-west-1a"},"PublicIpAddress":"52.0.0.1",'
                '"PrivateIpAddress":"10.0.0.10","PlatformDetails":"Linux/UNIX",'
                '"LaunchTime":"2026-03-25T08:15:00Z","Tags":[{"Key":"Name","Value":"web"}]}'
                ']}]}'
            ),
            summary="instances",
            succeeded=True,
        )
    )
    qapp.processEvents()

    assert window.workspace_ec2_instance_tree.topLevelItemCount() == 1
    assert window.workspace_ec2_instance_tree.topLevelItem(0).text(1) == "i-001"
    assert window.workspace_ec2_stop_button.isEnabled()
    assert not window.workspace_ec2_start_button.isEnabled()

    window.workspace_ec2_copy_ssh_button.click()
    qapp.processEvents()
    assert desktop.copied_texts[-1] == "ssh ec2-user@52.0.0.1"

def test_main_window_uses_a_two_splitter_s3_workspace_with_inspector_tabs(qapp, tmp_path: Path) -> None:
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

    window.lock_session_button.click()
    qapp.processEvents()

    assert window.workspace_s3_root_splitter is not None
    assert window.workspace_s3_root_splitter.orientation() == Qt.Horizontal
    assert window.workspace_s3_root_splitter.count() == 2
    assert window.workspace_s3_content_splitter is not None
    assert window.workspace_s3_content_splitter.orientation() == Qt.Horizontal
    assert window.workspace_s3_content_splitter.count() == 2
    assert window.workspace_s3_inspector_tabs is not None
    assert [window.workspace_s3_inspector_tabs.tabText(index) for index in range(window.workspace_s3_inspector_tabs.count())] == [
        "Upload",
        "Object Details",
        "Signed URL",
        "URL Tester",
    ]
    assert window.workspace_s3_bucket_tree.columnCount() == 2


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


def test_main_window_uploads_a_file_and_refreshes_the_s3_browser(qapp, tmp_path: Path) -> None:
    upload_file = tmp_path / "uploads" / "photo.png"
    upload_file.parent.mkdir(parents=True, exist_ok=True)
    upload_file.write_bytes(b"image-data")
    runner = DeferredRunner()
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

    window.workspace_s3_upload_source_input.setText(str(upload_file))
    qapp.processEvents()
    assert window.workspace_s3_upload_key_input.text() == "photo.png"

    window.workspace_s3_upload_button.click()
    qapp.processEvents()

    region_spec, _callback = runner.calls[0]
    assert region_spec.args[:2] == ("s3api", "head-bucket")
    runner.finish_next(
        CommandResult(
            spec=region_spec,
            exit_code=0,
            stdout="eu-west-2",
            summary="bucket-region",
            succeeded=True,
        )
    )
    qapp.processEvents()

    upload_spec, _callback = runner.calls[0]
    assert upload_spec.args[:2] == ("s3", "cp")
    assert upload_spec.args[3] == "s3://alpha/photo.png"
    runner.finish_next(
        CommandResult(
            spec=upload_spec,
            exit_code=0,
            stdout="",
            summary="upload",
            succeeded=True,
        )
    )
    qapp.processEvents()

    refreshed_object_spec, _callback = runner.calls[0]
    runner.finish_next(
        CommandResult(
            spec=refreshed_object_spec,
            exit_code=0,
            stdout='{"Contents":[{"Key":"photo.png","Size":10,"LastModified":"2026-03-25T08:15:00Z","StorageClass":"STANDARD"}]}',
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
            stdout='{"ContentLength":10,"LastModified":"2026-03-25T08:15:00Z","ContentType":"image/png"}',
            summary="head-object",
            succeeded=True,
        )
    )
    qapp.processEvents()

    assert window.workspace_s3_object_tree.topLevelItemCount() == 1
    assert window.workspace_s3_object_tree.topLevelItem(0).text(0) == "photo.png"
    assert "Uploaded photo.png to s3://alpha/photo.png" in window.workspace_s3_upload_status_label.text()


def test_main_window_rebuilds_s3_workspace_without_losing_data_or_headers(qapp, tmp_path: Path) -> None:
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

    for _ in range(2):
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

        object_spec, _callback = runner.calls[0]
        runner.finish_next(
            CommandResult(
                spec=object_spec,
                exit_code=0,
                stdout='{"Contents":[{"Key":"logs/app.log","Size":1024,"LastModified":"2026-03-25T08:15:00Z","StorageClass":"STANDARD"}]}',
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
                stdout='{"ContentLength":1024,"LastModified":"2026-03-25T08:15:00Z","ContentType":"text/plain"}',
                summary="head-object",
                succeeded=True,
            )
        )
        qapp.processEvents()

    assert window.workspace_s3_bucket_tree.columnCount() == 2
    assert window.workspace_s3_bucket_tree.headerItem().text(0) == "Bucket"
    assert window.workspace_s3_bucket_tree.headerItem().text(1) == "Created"
    assert window.workspace_s3_bucket_tree.topLevelItemCount() == 1
    assert window.workspace_s3_object_tree.columnCount() == 4
    assert window.workspace_s3_object_tree.headerItem().text(0) == "Key"
    assert window.workspace_s3_object_tree.topLevelItemCount() == 1
    assert window.workspace_s3_selected_bucket_label.text().startswith("Selected bucket: alpha")


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


def test_main_window_generates_and_copies_s3_signed_url_with_day_duration(qapp, tmp_path: Path) -> None:
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
            stdout='{"Buckets":[{"Name":"alpha","CreationDate":"2026-03-24T10:00:00Z"}]}',
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
            stdout='{"Contents":[{"Key":"logs/app.log","Size":1024,"LastModified":"2026-03-25T08:15:00Z","StorageClass":"STANDARD"}]}',
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
            stdout='{"ContentLength":1024,"LastModified":"2026-03-25T08:15:00Z","ContentType":"text/plain"}',
            summary="head-object",
            succeeded=True,
        )
    )
    qapp.processEvents()

    window.workspace_s3_signed_url_duration_unit_combo.setCurrentText("Days")
    qapp.processEvents()
    window.workspace_s3_signed_url_duration_spin.setValue(2)
    qapp.processEvents()
    window.workspace_s3_generate_signed_url_button.click()
    qapp.processEvents()

    region_spec, _callback = runner.calls[0]
    assert region_spec.args[:2] == ("s3api", "head-bucket")
    runner.finish_next(
        CommandResult(
            spec=region_spec,
            exit_code=0,
            stdout="eu-west-2",
            summary="bucket-region",
            succeeded=True,
        )
    )
    qapp.processEvents()

    presign_spec, _callback = runner.calls[0]
    assert presign_spec.args[:2] == ("s3", "presign")
    assert "--expires-in" in presign_spec.args
    expires_index = presign_spec.args.index("--expires-in")
    assert presign_spec.args[expires_index + 1] == "172800"

    signed_url = "https://example-bucket.s3.amazonaws.com/logs/app.log?X-Amz-Signature=abc123"
    runner.finish_next(
        CommandResult(
            spec=presign_spec,
            exit_code=0,
            stdout=signed_url,
            summary="presign",
            succeeded=True,
        )
    )
    qapp.processEvents()

    assert signed_url in window.workspace_s3_signed_url_output.toPlainText()

    window.workspace_s3_copy_signed_url_button.click()
    qapp.processEvents()

    assert desktop.copied_texts[-1] == signed_url


def test_main_window_can_analyse_and_validate_a_pasted_url(qapp, tmp_path: Path) -> None:
    settings = AppSettings.from_env(
        home_dir=tmp_path / "home",
        appdata_dir=tmp_path / "appdata",
        local_appdata_dir=tmp_path / "local-appdata",
        config_dir=tmp_path / "config-root",
    )
    url_validator = DeferredUrlValidator()
    controller = CloudSprocketController(
        settings=settings,
        auth_service=StaticAuthService(),
        profile_discovery=StaticDiscoveryService(),
        command_runner=DeferredRunner(),
        url_validator=url_validator,
        desktop_integration=FakeDesktopIntegration(),
    )
    window = MainWindow(settings=settings, controller=controller)

    window.lock_session_button.click()
    qapp.processEvents()

    pasted_url = (
        "https://example-bucket.s3.eu-west-2.amazonaws.com/logs/app.log"
        "?X-Amz-Algorithm=AWS4-HMAC-SHA256"
        "&X-Amz-Date=20260325T100000Z"
        "&X-Amz-Expires=7200"
        "&X-Amz-Security-Token=token"
    )
    window.workspace_s3_url_tester_input.setPlainText(pasted_url)
    window.workspace_s3_analyse_url_button.click()
    qapp.processEvents()

    labels = {
        window.workspace_s3_url_tester_details_tree.topLevelItem(index).text(0)
        for index in range(window.workspace_s3_url_tester_details_tree.topLevelItemCount())
    }
    assert {"Signature Type", "Nominal Expiry", "Time Remaining"} <= labels

    window.workspace_s3_validate_url_button.click()
    qapp.processEvents()
    assert url_validator.calls[0][0] == pasted_url

    url_validator.finish_next(
        UrlValidationResult(
            url=pasted_url,
            succeeded=True,
            summary="Live validation succeeded with HTTP 206.",
            detail_fields=(DetailField(label="HTTP Status", value="206 Partial Content"),),
        )
    )
    qapp.processEvents()

    labels = {
        window.workspace_s3_url_tester_details_tree.topLevelItem(index).text(0)
        for index in range(window.workspace_s3_url_tester_details_tree.topLevelItemCount())
    }
    assert "HTTP Status" in labels






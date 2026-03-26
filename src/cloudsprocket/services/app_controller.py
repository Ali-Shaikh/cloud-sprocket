from __future__ import annotations

import json
from collections.abc import Sequence
from datetime import UTC, datetime
from pathlib import Path
from typing import Protocol

from PySide6.QtCore import QObject, QUrl, Signal
from PySide6.QtGui import QDesktopServices
from PySide6.QtWidgets import QApplication

from cloudsprocket.config import APP_BRAND_NAME, APP_DESCRIPTION, AUTHOR_NAME, AppSettings
from cloudsprocket.models import (
    ActionKind,
    AuthMethod,
    AuthMethodStatus,
    CommandExecutionType,
    CommandResult,
    CommandSpec,
    CommandState,
    DetailField,
    DiscoveryReport,
    LogEntry,
    LogLevel,
    ProfileDetails,
    ProviderAction,
    ProviderHealth,
    S3BucketSummary,
    S3ObjectSummary,
    SignedUrlDurationUnit,
    S3WorkspaceState,
    SessionState,
    WorkspaceTab,
)
from cloudsprocket.services.auth import AuthStatusService
from cloudsprocket.services.command_runner import BackgroundCommandRunner
from cloudsprocket.services.profile_discovery import ProfileDiscoveryService
from cloudsprocket.services.provider_actions import ProviderAdapter, create_provider_adapters
from cloudsprocket.services.url_tester import BackgroundUrlValidator, UrlValidationResult, analyse_url

AWS_S3_MULTIPART_THRESHOLD_BYTES = 8 * 1024 * 1024


class DesktopIntegration(Protocol):
    def open_path(self, path: str) -> bool:
        ...

    def copy_text(self, text: str) -> None:
        ...


class QtDesktopIntegration:
    def open_path(self, path: str) -> bool:
        return QDesktopServices.openUrl(QUrl.fromLocalFile(path))

    def copy_text(self, text: str) -> None:
        clipboard = QApplication.clipboard()
        clipboard.setText(text)


class CloudSprocketController(QObject):
    state_changed = Signal()

    def __init__(
        self,
        *,
        settings: AppSettings,
        auth_service: AuthStatusService,
        profile_discovery: ProfileDiscoveryService,
        provider_adapters: dict[str, ProviderAdapter] | None = None,
        command_runner: BackgroundCommandRunner | None = None,
        url_validator: BackgroundUrlValidator | None = None,
        desktop_integration: DesktopIntegration | None = None,
    ) -> None:
        super().__init__()
        self._settings = settings
        self._auth_service = auth_service
        self._profile_discovery = profile_discovery
        self._provider_adapters = provider_adapters or create_provider_adapters(settings)
        self._command_runner = command_runner or BackgroundCommandRunner()
        self._url_validator = url_validator or BackgroundUrlValidator()
        self._desktop_integration = desktop_integration or QtDesktopIntegration()
        self._session_state = SessionState()
        self._provider_snapshot: tuple[ProviderHealth, ...] = ()
        self._discovery_report = DiscoveryReport()
        self.refresh(emit_signal=False)

    @property
    def session_state(self) -> SessionState:
        return self._session_state

    @property
    def provider_snapshot(self) -> tuple[ProviderHealth, ...]:
        return self._provider_snapshot

    @property
    def discovery_report(self) -> DiscoveryReport:
        return self._discovery_report

    @property
    def brand_name(self) -> str:
        return self._settings.app_brand_name

    def about_text(self) -> str:
        return "\n".join(
            [
                APP_BRAND_NAME,
                APP_DESCRIPTION,
                "",
                f"Created by {AUTHOR_NAME}",
                "CLI + SSO + Local files auth model",
                "AWS is the reference provider in this milestone.",
                "Azure and GCP remain visible through the same provider shell.",
            ]
        )

    def refresh(self, *, emit_signal: bool = True) -> None:
        self._provider_snapshot = self._auth_service.snapshot()
        self._discovery_report = self._profile_discovery.discover()
        self._reconcile_selection()
        self._reconcile_auth_selection()
        if self.is_session_locked() and self._session_state.locked_provider_id == "aws":
            available, _reason = self.aws_s3_availability()
            if not available:
                self._reset_aws_s3_workspace()
        if emit_signal:
            self.state_changed.emit()

    def provider_health(self, provider_id: str | None) -> ProviderHealth | None:
        if provider_id is None:
            return None
        for provider in self._provider_snapshot:
            if provider.provider_id == provider_id:
                return provider
        return None

    def profiles_for_provider(self, provider_id: str | None) -> tuple:
        if provider_id is None:
            return ()
        return tuple(
            profile
            for profile in self._discovery_report.profiles
            if profile.provider_id == provider_id
        )

    def current_provider_id(self) -> str | None:
        return self._session_state.current_provider_id

    def set_current_provider(self, provider_id: str) -> None:
        self._session_state.current_provider_id = provider_id
        profiles = self.profiles_for_provider(provider_id)
        if profiles:
            if self._session_state.selected_profile_id not in {profile.profile_id for profile in profiles}:
                self._session_state.selected_profile_id = profiles[0].profile_id
        else:
            self._session_state.selected_profile_id = None
        self._reconcile_auth_selection()
        self.state_changed.emit()

    def selected_profile(self):
        provider_id = self._session_state.current_provider_id
        profile_id = self._session_state.selected_profile_id
        if provider_id is None or profile_id is None:
            return None
        for profile in self.profiles_for_provider(provider_id):
            if profile.profile_id == profile_id:
                return profile
        return None

    def select_profile(self, provider_id: str, profile_id: str) -> None:
        self._session_state.current_provider_id = provider_id
        self._session_state.selected_profile_id = profile_id
        self._reconcile_auth_selection()
        self.state_changed.emit()

    def available_auth_methods(self) -> tuple[AuthMethodStatus, ...]:
        return self.selected_profile_details().auth_methods

    def selected_auth_method(self) -> AuthMethod | None:
        provider_id = self._session_state.current_provider_id
        if provider_id is None:
            return None
        return self._session_state.selected_auth_method(provider_id)

    def select_auth_method(self, method: AuthMethod) -> bool:
        available_methods = {
            candidate.method: candidate
            for candidate in self.available_auth_methods()
            if candidate.available
        }
        if method not in available_methods:
            return False
        provider_id = self._session_state.current_provider_id
        if provider_id is None:
            return False
        self._session_state.selected_auth_method_by_provider[provider_id] = method
        self.state_changed.emit()
        return True

    def can_lock_session(self) -> bool:
        if self._session_state.command_state == CommandState.RUNNING:
            return False
        if self._session_state.current_provider_id is None or self.selected_profile() is None:
            return False
        selected_auth_method = self.selected_auth_method()
        if selected_auth_method is None:
            return False
        return any(
            method.method == selected_auth_method and method.available
            for method in self.available_auth_methods()
        )

    def lock_session_reason(self) -> str:
        if self._session_state.command_state == CommandState.RUNNING:
            return "Wait for the current command to finish before locking the session."
        if self._session_state.current_provider_id is None:
            return "Select a provider before locking the session."
        if self.selected_profile() is None:
            return "Select a profile before locking the session."
        selected_auth_method = self.selected_auth_method()
        if selected_auth_method is None:
            return "Select an available auth method before locking the session."
        for method in self.available_auth_methods():
            if method.method == selected_auth_method:
                if method.available:
                    return ""
                return f"{method.label} is not available for the selected profile."
        return "Select an available auth method before locking the session."

    def lock_session(self) -> bool:
        if not self.can_lock_session():
            reason = self.lock_session_reason()
            if reason:
                self._append_log(LogLevel.WARNING, reason)
                self.state_changed.emit()
            return False
        profile = self.selected_profile()
        provider_id = self._session_state.current_provider_id
        auth_method = self.selected_auth_method()
        if profile is None or provider_id is None or auth_method is None:
            return False
        self._session_state.locked_provider_id = provider_id
        self._session_state.locked_profile_id = profile.profile_id
        self._session_state.locked_auth_method = auth_method
        self._reset_aws_s3_workspace()
        self._append_log(
            LogLevel.SUCCESS,
            f"Locked {provider_id.upper()} session for {profile.profile_id} using {auth_method.value}.",
        )
        self.state_changed.emit()
        return True

    def unlock_session(self) -> None:
        if not self.is_session_locked():
            return
        locked_provider_id = self._session_state.locked_provider_id or ""
        locked_profile_id = self._session_state.locked_profile_id or ""
        self._session_state.locked_provider_id = None
        self._session_state.locked_profile_id = None
        self._session_state.locked_auth_method = None
        self._reset_aws_s3_workspace()
        self._append_log(
            LogLevel.INFO,
            f"Unlocked {locked_provider_id.upper()} session for {locked_profile_id}.",
        )
        self.state_changed.emit()

    def is_session_locked(self) -> bool:
        return (
            self._session_state.locked_provider_id is not None
            and self._session_state.locked_profile_id is not None
            and self._session_state.locked_auth_method is not None
        )

    def locked_profile(self):
        provider_id = self._session_state.locked_provider_id
        profile_id = self._session_state.locked_profile_id
        if provider_id is None or profile_id is None:
            return None
        for profile in self.profiles_for_provider(provider_id):
            if profile.profile_id == profile_id:
                return profile
        return None

    def locked_provider_health(self) -> ProviderHealth | None:
        return self.provider_health(self._session_state.locked_provider_id)

    def aws_s3_workspace(self) -> S3WorkspaceState:
        return self._session_state.aws_s3_workspace

    def aws_s3_availability(self) -> tuple[bool, str]:
        if not self.is_session_locked():
            return False, "Lock an AWS session to work with S3."
        if self._session_state.locked_provider_id != "aws":
            return False, "S3 is only available for locked AWS sessions."
        if self._session_state.locked_auth_method == AuthMethod.LOCAL_FILES:
            return False, "Unlock the session and choose CLI or SSO to browse S3."
        provider_health = self.locked_provider_health()
        if provider_health is None or provider_health.command_path is None:
            return False, "AWS CLI is required to browse S3 from the locked workspace."
        if self.locked_profile() is None:
            return False, "The locked AWS profile is no longer available."
        return True, ""

    def can_refresh_aws_s3_buckets(self) -> bool:
        available, _reason = self.aws_s3_availability()
        return available and self._session_state.command_state != CommandState.RUNNING

    def can_refresh_aws_s3_objects(self) -> bool:
        return (
            self.can_refresh_aws_s3_buckets()
            and self._session_state.aws_s3_workspace.selected_bucket_name is not None
        )

    def can_refresh_aws_s3_object_metadata(self) -> bool:
        return (
            self.can_refresh_aws_s3_buckets()
            and self._session_state.aws_s3_workspace.selected_bucket_name is not None
            and self._session_state.aws_s3_workspace.selected_object_key is not None
        )

    def can_generate_aws_s3_signed_url(self) -> bool:
        return self.can_refresh_aws_s3_object_metadata()

    def can_copy_aws_s3_signed_url(self) -> bool:
        return bool(self._session_state.aws_s3_workspace.signed_url)

    def can_analyse_aws_s3_test_url(self) -> bool:
        return bool(self._session_state.aws_s3_workspace.url_tester_input.strip())

    def can_validate_aws_s3_test_url(self) -> bool:
        return self.can_analyse_aws_s3_test_url() and self._session_state.command_state != CommandState.RUNNING

    def can_upload_aws_s3_file(self) -> bool:
        available, _reason = self.aws_s3_availability()
        if not available or self._session_state.command_state == CommandState.RUNNING:
            return False
        state = self._session_state.aws_s3_workspace
        source_path = self._aws_s3_upload_source_file()
        return (
            state.selected_bucket_name is not None
            and source_path is not None
            and source_path.is_file()
            and bool(state.upload_object_key.strip())
        )

    def aws_s3_upload_detail_fields(self) -> tuple[DetailField, ...]:
        state = self._session_state.aws_s3_workspace
        fields = [
            DetailField(
                label="Bucket",
                value=state.selected_bucket_name or "Select a bucket to enable uploads.",
            )
        ]

        source_path = self._aws_s3_upload_source_file()
        if state.upload_source_path:
            fields.append(DetailField(label="Source File", value=state.upload_source_path))
        else:
            fields.append(DetailField(label="Source File", value="Choose a local file to upload."))

        if source_path is not None and source_path.exists() and source_path.is_file():
            file_size = source_path.stat().st_size
            fields.append(DetailField(label="File Size", value=self._format_s3_size(file_size)))
            fields.append(
                DetailField(
                    label="Transfer Mode",
                    value=self._aws_s3_upload_mode_label(file_size),
                )
            )
            fields.append(
                DetailField(
                    label="Multipart Threshold",
                    value="8 MiB (AWS CLI default multipart threshold)",
                )
            )
        elif state.upload_source_path:
            fields.append(DetailField(label="File Status", value="The selected file is not available."))

        if state.upload_object_key:
            fields.append(DetailField(label="Object Key", value=state.upload_object_key))
        else:
            fields.append(DetailField(label="Object Key", value="Set the destination object key."))

        if state.selected_bucket_name and state.upload_object_key:
            fields.append(
                DetailField(
                    label="Destination URI",
                    value=f"s3://{state.selected_bucket_name}/{state.upload_object_key}",
                )
            )
        if state.prefix_filter:
            fields.append(DetailField(label="Current Prefix Filter", value=state.prefix_filter))
        return tuple(fields)

    def set_aws_s3_upload_source_path(self, source_path: str) -> bool:
        normalised = str(Path(source_path.strip()).expanduser()) if source_path.strip() else ""
        state = self._session_state.aws_s3_workspace
        if normalised == state.upload_source_path:
            return False
        state.upload_source_path = normalised
        if normalised and not state.upload_object_key:
            state.upload_object_key = self._default_aws_s3_upload_object_key(normalised)
        self._refresh_aws_s3_upload_status()
        self.state_changed.emit()
        return True

    def clear_aws_s3_upload_selection(self) -> bool:
        state = self._session_state.aws_s3_workspace
        if not state.upload_source_path and not state.upload_object_key:
            return False
        state.upload_source_path = ""
        state.upload_object_key = ""
        self._refresh_aws_s3_upload_status()
        self.state_changed.emit()
        return True

    def set_aws_s3_upload_object_key(self, object_key: str) -> bool:
        normalised = object_key.strip().replace("\\", "/").lstrip("/")
        state = self._session_state.aws_s3_workspace
        if normalised == state.upload_object_key:
            return False
        state.upload_object_key = normalised
        self._refresh_aws_s3_upload_status()
        self.state_changed.emit()
        return True

    def set_aws_s3_prefix_filter(self, prefix: str) -> bool:
        normalised_prefix = prefix.strip()
        state = self._session_state.aws_s3_workspace
        if normalised_prefix == state.prefix_filter:
            return False
        state.prefix_filter = normalised_prefix
        state.selected_object_key = None
        state.object_metadata = ()
        self._reset_s3_signed_url_state(state)
        if normalised_prefix:
            state.object_status_message = f"Prefix filter active: {normalised_prefix}"
        else:
            state.object_status_message = "Select an object to inspect its metadata."
        self._refresh_aws_s3_upload_status()
        self.state_changed.emit()
        return True

    def set_aws_s3_signed_url_duration(self, duration_seconds: int) -> bool:
        if duration_seconds % 86400 == 0:
            duration_value = max(1, min(int(duration_seconds / 86400), 7))
            duration_unit = SignedUrlDurationUnit.DAYS
        else:
            duration_value = max(1, min(int(duration_seconds / 3600), 168))
            duration_unit = SignedUrlDurationUnit.HOURS
        return self._set_aws_s3_signed_url_duration_selection(duration_value, duration_unit)

    def set_aws_s3_signed_url_duration_value(self, duration_value: int) -> bool:
        state = self._session_state.aws_s3_workspace
        return self._set_aws_s3_signed_url_duration_selection(
            duration_value,
            state.signed_url_duration_unit,
        )

    def set_aws_s3_signed_url_duration_unit(self, duration_unit: SignedUrlDurationUnit | str) -> bool:
        state = self._session_state.aws_s3_workspace
        return self._set_aws_s3_signed_url_duration_selection(
            state.signed_url_duration_value,
            duration_unit,
        )

    def set_aws_s3_test_url_input(self, url: str) -> bool:
        normalised_url = url.strip()
        state = self._session_state.aws_s3_workspace
        if normalised_url == state.url_tester_input:
            return False
        state.url_tester_input = normalised_url
        state.url_tester_detail_fields = ()
        if normalised_url:
            state.url_tester_status_message = "Analyse or validate the pasted URL."
        else:
            state.url_tester_status_message = "Paste any URL to inspect it or validate it."
        self.state_changed.emit()
        return True

    def copy_aws_s3_uri(self) -> bool:
        bucket_name = self._session_state.aws_s3_workspace.selected_bucket_name
        if bucket_name is None:
            message = "Select an S3 bucket before copying an S3 URI."
            self._append_log(LogLevel.WARNING, message, action_id="aws-s3-copy-uri")
            self.state_changed.emit()
            return False
        object_key = self._session_state.aws_s3_workspace.selected_object_key
        if object_key:
            uri = f"s3://{bucket_name}/{object_key}"
        else:
            uri = f"s3://{bucket_name}/"
        self._desktop_integration.copy_text(uri)
        self._append_log(
            LogLevel.SUCCESS,
            "Copied S3 URI to the clipboard.",
            details=uri,
            action_id="aws-s3-copy-uri",
        )
        self.state_changed.emit()
        return True

    def copy_aws_s3_signed_url(self) -> bool:
        signed_url = self._session_state.aws_s3_workspace.signed_url.strip()
        if not signed_url:
            message = "Generate a signed URL before copying it."
            self._append_log(LogLevel.WARNING, message, action_id="aws-s3-signed-url-copy")
            self.state_changed.emit()
            return False
        self._desktop_integration.copy_text(signed_url)
        self._append_log(
            LogLevel.SUCCESS,
            "Copied the signed URL to the clipboard.",
            details=signed_url,
            action_id="aws-s3-signed-url-copy",
        )
        self.state_changed.emit()
        return True

    def use_generated_aws_s3_signed_url_for_testing(self) -> bool:
        signed_url = self._session_state.aws_s3_workspace.signed_url.strip()
        if not signed_url:
            message = "Generate a signed URL before loading it into the tester."
            self._append_log(LogLevel.WARNING, message, action_id="aws-s3-url-tester-use-generated")
            self.state_changed.emit()
            return False
        state = self._session_state.aws_s3_workspace
        state.url_tester_input = signed_url
        self._apply_url_test_analysis(signed_url)
        self._append_log(
            LogLevel.SUCCESS,
            "Loaded the generated signed URL into the tester.",
            action_id="aws-s3-url-tester-use-generated",
        )
        self.state_changed.emit()
        return True

    def refresh_aws_s3_buckets(self) -> bool:
        available, reason = self.aws_s3_availability()
        if not available:
            self._session_state.aws_s3_workspace.status_message = reason
            self._session_state.aws_s3_workspace.bucket_status_message = reason
            self._append_log(LogLevel.WARNING, reason, action_id="aws-s3-buckets")
            self.state_changed.emit()
            return False
        if self._session_state.command_state == CommandState.RUNNING:
            message = "Wait for the current command to finish before refreshing S3 buckets."
            self._session_state.aws_s3_workspace.status_message = message
            self._append_log(LogLevel.WARNING, message, action_id="aws-s3-buckets")
            self.state_changed.emit()
            return False

        profile = self.locked_profile()
        if profile is None:
            return False

        self._session_state.aws_s3_workspace.status_message = (
            f"Loading S3 buckets for {profile.profile_id}..."
        )
        self._session_state.aws_s3_workspace.bucket_status_message = "Loading buckets..."
        spec = CommandSpec(
            action_id="aws-s3-buckets",
            execution_type=CommandExecutionType.PROCESS,
            program="aws",
            args=(
                "s3api",
                "list-buckets",
                "--profile",
                profile.profile_id,
                "--output",
                "json",
                "--no-cli-pager",
            ),
            summary=f"List S3 buckets for AWS profile {profile.profile_id}",
        )
        return self._run_process_command(
            action_id="aws-s3-buckets",
            label="S3 Buckets",
            spec=spec,
            on_finished=lambda result: self._finish_aws_s3_bucket_refresh(profile.profile_id, result),
        )

    def refresh_aws_s3_objects(self) -> bool:
        bucket_name = self._session_state.aws_s3_workspace.selected_bucket_name
        if bucket_name is None:
            message = "Select an S3 bucket before refreshing its contents."
            self._session_state.aws_s3_workspace.bucket_status_message = message
            self._append_log(LogLevel.WARNING, message, action_id="aws-s3-objects")
            self.state_changed.emit()
            return False
        return self._start_aws_s3_object_refresh(bucket_name)

    def refresh_aws_s3_object_metadata(self) -> bool:
        bucket_name = self._session_state.aws_s3_workspace.selected_bucket_name
        object_key = self._session_state.aws_s3_workspace.selected_object_key
        if bucket_name is None or object_key is None:
            message = "Select an S3 object before refreshing its metadata."
            self._session_state.aws_s3_workspace.object_status_message = message
            self._append_log(LogLevel.WARNING, message, action_id="aws-s3-object-details")
            self.state_changed.emit()
            return False
        return self._start_aws_s3_object_metadata_refresh(bucket_name, object_key)

    def upload_aws_s3_file(self) -> bool:
        available, reason = self.aws_s3_availability()
        state = self._session_state.aws_s3_workspace
        if not available:
            state.upload_status_message = reason
            self._append_log(LogLevel.WARNING, reason, action_id="aws-s3-upload")
            self.state_changed.emit()
            return False
        if self._session_state.command_state == CommandState.RUNNING:
            message = "Wait for the current command to finish before starting an upload."
            state.upload_status_message = message
            self._append_log(LogLevel.WARNING, message, action_id="aws-s3-upload")
            self.state_changed.emit()
            return False

        bucket_name = state.selected_bucket_name
        if bucket_name is None:
            message = "Select an S3 bucket before uploading a file."
            state.upload_status_message = message
            self._append_log(LogLevel.WARNING, message, action_id="aws-s3-upload")
            self.state_changed.emit()
            return False

        source_path = self._aws_s3_upload_source_file()
        if source_path is None or not source_path.exists() or not source_path.is_file():
            message = "Choose a local file that exists before uploading."
            state.upload_status_message = message
            self._append_log(LogLevel.WARNING, message, action_id="aws-s3-upload")
            self.state_changed.emit()
            return False

        object_key = state.upload_object_key.strip()
        if not object_key:
            message = "Set the destination object key before uploading."
            state.upload_status_message = message
            self._append_log(LogLevel.WARNING, message, action_id="aws-s3-upload")
            self.state_changed.emit()
            return False

        file_size = source_path.stat().st_size
        cached_region = state.bucket_regions.get(bucket_name, "").strip()
        if cached_region:
            return self._start_aws_s3_upload(bucket_name, source_path, object_key, file_size, cached_region)
        return self._start_aws_s3_upload_bucket_region_lookup(bucket_name, source_path, object_key, file_size)

    def generate_aws_s3_signed_url(self) -> bool:
        bucket_name = self._session_state.aws_s3_workspace.selected_bucket_name
        object_key = self._session_state.aws_s3_workspace.selected_object_key
        if bucket_name is None or object_key is None:
            message = "Select an S3 object before generating a signed URL."
            self._session_state.aws_s3_workspace.signed_url_status_message = message
            self._append_log(LogLevel.WARNING, message, action_id="aws-s3-signed-url")
            self.state_changed.emit()
            return False
        duration_seconds = self._aws_s3_signed_url_duration_seconds()
        cached_region = self._session_state.aws_s3_workspace.bucket_regions.get(bucket_name, "").strip()
        if cached_region:
            return self._start_aws_s3_signed_url_generation(
                bucket_name,
                object_key,
                duration_seconds,
                cached_region,
            )
        return self._start_aws_s3_bucket_region_lookup(bucket_name, object_key, duration_seconds)

    def analyse_aws_s3_test_url(self) -> bool:
        url = self._session_state.aws_s3_workspace.url_tester_input.strip()
        if not url:
            message = "Paste a URL before analysing it."
            self._session_state.aws_s3_workspace.url_tester_status_message = message
            self._append_log(LogLevel.WARNING, message, action_id="aws-s3-url-analyse")
            self.state_changed.emit()
            return False
        self._apply_url_test_analysis(url)
        self._append_log(
            LogLevel.INFO,
            self._session_state.aws_s3_workspace.url_tester_status_message,
            action_id="aws-s3-url-analyse",
        )
        self.state_changed.emit()
        return True

    def validate_aws_s3_test_url(self) -> bool:
        url = self._session_state.aws_s3_workspace.url_tester_input.strip()
        if not url:
            message = "Paste a URL before validating it."
            self._session_state.aws_s3_workspace.url_tester_status_message = message
            self._append_log(LogLevel.WARNING, message, action_id="aws-s3-url-validate")
            self.state_changed.emit()
            return False
        if self._session_state.command_state == CommandState.RUNNING:
            message = "Wait for the current command to finish before validating a URL."
            self._session_state.aws_s3_workspace.url_tester_status_message = message
            self._append_log(LogLevel.WARNING, message, action_id="aws-s3-url-validate")
            self.state_changed.emit()
            return False

        self._apply_url_test_analysis(url)
        self._session_state.command_state = CommandState.RUNNING
        self._session_state.running_action_id = "aws-s3-url-validate"
        self._session_state.aws_s3_workspace.url_tester_status_message = "Validating the URL..."
        self._append_log(
            LogLevel.INFO,
            "Running URL validation",
            details=url,
            action_id="aws-s3-url-validate",
        )
        self.state_changed.emit()
        self._url_validator.run(url, self._finish_aws_s3_test_url_validation)
        return True

    def select_aws_s3_bucket(self, bucket_name: str) -> bool:
        if bucket_name == self._session_state.aws_s3_workspace.selected_bucket_name:
            return False
        if not any(bucket.name == bucket_name for bucket in self._session_state.aws_s3_workspace.buckets):
            return False
        state = self._session_state.aws_s3_workspace
        state.selected_bucket_name = bucket_name
        state.objects = ()
        state.selected_object_key = None
        state.object_metadata = ()
        state.object_status_message = "Select an object to inspect its metadata."
        self._reset_s3_signed_url_state(state)
        state.bucket_status_message = (
            f"Selected {bucket_name}. Loading bucket contents..."
        )
        self._refresh_aws_s3_upload_status()
        return self._start_aws_s3_object_refresh(bucket_name)

    def select_aws_s3_object(self, object_key: str) -> bool:
        state = self._session_state.aws_s3_workspace
        bucket_name = state.selected_bucket_name
        if bucket_name is None:
            return False
        if object_key == state.selected_object_key:
            return False
        if not any(obj.key == object_key for obj in state.objects):
            return False
        state.selected_object_key = object_key
        state.object_metadata = ()
        state.object_status_message = f"Loading metadata for {object_key}..."
        self._reset_s3_signed_url_state(state)
        return self._start_aws_s3_object_metadata_refresh(bucket_name, object_key)

    def workspace_tabs(self) -> tuple[WorkspaceTab, ...]:
        if not self.is_session_locked():
            return ()
        provider_id = self._session_state.locked_provider_id or ""
        auth_method = self._session_state.locked_auth_method
        auth_label = auth_method.value.upper() if auth_method else "UNKNOWN"
        if provider_id == "aws":
            s3_available, s3_reason = self.aws_s3_availability()
            s3_state = self._session_state.aws_s3_workspace
            s3_summary = "Browse S3 buckets and inspect object listings for the locked AWS session."
            if s3_state.buckets:
                s3_summary = f"{len(s3_state.buckets)} S3 buckets loaded for the locked session."
            if not s3_available:
                s3_summary = "S3 browsing is unavailable for the current locked session."
            s3_detail = (
                s3_state.bucket_status_message
                if s3_available
                else s3_reason
            )
            return (
                WorkspaceTab(
                    tab_id="overview",
                    label="Overview",
                    summary="Locked AWS session overview.",
                    detail=f"Review the locked AWS workspace before moving into a service tab. Current auth mode: {auth_label}.",
                ),
                WorkspaceTab(
                    tab_id="s3",
                    label="S3",
                    summary=s3_summary,
                    detail=s3_detail,
                ),
                WorkspaceTab(
                    tab_id="ec2",
                    label="EC2",
                    summary="Instance and fleet workspace placeholder.",
                    detail="This tab will become the focused EC2 workspace for the locked AWS session.",
                ),
                WorkspaceTab(
                    tab_id="iam",
                    label="IAM",
                    summary="Identity and permission workspace placeholder.",
                    detail="This tab will become the focused IAM workspace for the locked AWS session.",
                ),
                WorkspaceTab(
                    tab_id="cloudwatch",
                    label="CloudWatch",
                    summary="Logs and metrics workspace placeholder.",
                    detail="This tab will become the focused CloudWatch workspace for the locked AWS session.",
                ),
                WorkspaceTab(
                    tab_id="actions",
                    label="Actions",
                    summary="Quick actions for the locked AWS session.",
                    detail="This tab keeps the AWS session actions available without returning to session setup.",
                ),
            )
        return (
            WorkspaceTab(
                tab_id="overview",
                label="Overview",
                summary=f"Locked {provider_id.upper()} session overview.",
                detail="Provider-specific workspace tabs will be added after the AWS session flow is complete.",
            ),
            WorkspaceTab(
                tab_id="actions",
                label="Actions",
                summary="Session actions placeholder.",
                detail="Provider-wide actions for the locked session will appear here.",
            ),
        )

    def locked_session_title(self) -> str:
        profile = self.locked_profile()
        if profile is None:
            return "Locked Session"
        return f"{profile.provider_id.upper()} Workspace"

    def locked_session_summary(self) -> str:
        profile = self.locked_profile()
        auth_method = self._session_state.locked_auth_method
        if profile is None or auth_method is None:
            return "No locked session."
        return f"{profile.display_name} locked with {auth_method.value.upper()}."

    def selected_profile_details(self) -> ProfileDetails:
        adapter = self._current_adapter()
        if adapter is None:
            return ProfileDetails(
                provider_id="",
                title="No provider available",
                subtitle="",
                summary="No providers were detected in the current environment.",
            )
        return adapter.describe_profile(
            self.selected_profile(),
            self._session_state,
            self.provider_health(self._session_state.current_provider_id),
        )

    def available_actions(self) -> tuple[ProviderAction, ...]:
        adapter = self._current_adapter()
        if adapter is None:
            return ()
        current_provider_id = self._session_state.current_provider_id
        return adapter.list_actions(
            self.selected_profile(),
            self.profiles_for_provider(current_provider_id),
            self._session_state,
            self.provider_health(current_provider_id),
        )

    def status_message(self) -> str:
        if self._session_state.command_state == CommandState.RUNNING and self._session_state.running_action_id:
            return f"Running {self._session_state.running_action_id}..."
        warning_suffix = ""
        if self._discovery_report.warnings:
            warning_suffix = f" ({len(self._discovery_report.warnings)} warnings)"
        active_suffix = ""
        current_provider_id = self._session_state.current_provider_id
        if current_provider_id:
            active_profile_id = self._session_state.active_profile_id(current_provider_id)
            if active_profile_id:
                active_suffix = f" | active {current_provider_id.upper()} profile: {active_profile_id}"
        return (
            f"{len(self._provider_snapshot)} providers, "
            f"{len(self._discovery_report.profiles)} profiles{warning_suffix}{active_suffix}"
        )

    def log_entries(self) -> Sequence[LogEntry]:
        return tuple(self._session_state.recent_logs)

    def trigger_action(self, action_id: str) -> bool:
        action = next((candidate for candidate in self.available_actions() if candidate.action_id == action_id), None)
        if action is None:
            return False
        if not action.enabled:
            message = action.disabled_reason or f"{action.label} is not available right now."
            self._append_log(LogLevel.WARNING, message, action_id=action.action_id)
            self.state_changed.emit()
            return False

        adapter = self._current_adapter()
        if adapter is None:
            return False

        profile = self.selected_profile()
        spec = adapter.build_command(action, profile, self._session_state)

        if spec.execution_type == CommandExecutionType.INTERNAL:
            self._handle_internal_action(action, profile, spec)
            return True
        if spec.execution_type == CommandExecutionType.OPEN_PATH and spec.path is not None:
            opened = self._desktop_integration.open_path(str(spec.path))
            if opened:
                self._append_log(
                    LogLevel.SUCCESS,
                    f"Opened {spec.path}",
                    action_id=action.action_id,
                )
            else:
                self._append_log(
                    LogLevel.ERROR,
                    f"Could not open {spec.path}",
                    action_id=action.action_id,
                )
            self.state_changed.emit()
            return opened
        if spec.execution_type == CommandExecutionType.COPY_TEXT and spec.clipboard_text is not None:
            self._desktop_integration.copy_text(spec.clipboard_text)
            self._append_log(
                LogLevel.SUCCESS,
                "Copied export snippet to the clipboard.",
                details=spec.clipboard_text,
                action_id=action.action_id,
            )
            self.state_changed.emit()
            return True
        if spec.execution_type == CommandExecutionType.PROCESS:
            return self._run_process_command(
                action_id=action.action_id,
                label=action.label,
                spec=spec,
                on_finished=lambda result: self._finish_process_action(adapter, action, profile, result),
            )

        return False

    def _finish_process_action(
        self,
        adapter: ProviderAdapter,
        action: ProviderAction,
        profile,
        result: CommandResult,
    ) -> None:
        parsed_result = adapter.parse_result(action, profile, result, self._session_state)
        self._session_state.command_state = CommandState.IDLE
        self._session_state.running_action_id = None
        log_level = LogLevel.SUCCESS if parsed_result.succeeded else LogLevel.ERROR
        details = "\n\n".join(
            part for part in (parsed_result.stdout, parsed_result.stderr) if part
        )
        self._append_log(
            log_level,
            parsed_result.summary or action.label,
            details=details,
            action_id=action.action_id,
        )
        if action.kind in (ActionKind.SSO_LOGIN, ActionKind.LOGOUT, ActionKind.REFRESH):
            self.refresh()
            return
        self.state_changed.emit()

    def _handle_internal_action(self, action: ProviderAction, profile, spec) -> None:
        if action.kind == ActionKind.REFRESH:
            self._append_log(LogLevel.INFO, "Refreshing provider snapshot.", action_id=action.action_id)
            self.refresh()
            return
        if action.kind == ActionKind.ACTIVATE and profile is not None:
            self._session_state.active_profile_by_provider[self._session_state.current_provider_id or ""] = profile.profile_id
            self._append_log(
                LogLevel.SUCCESS,
                f"Activated AWS profile {profile.profile_id} inside CloudSprocket.",
                action_id=action.action_id,
            )
            self.state_changed.emit()
            return
        self._append_log(
            LogLevel.INFO,
            spec.summary or action.label,
            action_id=action.action_id,
        )
        self.state_changed.emit()

    def _run_process_command(
        self,
        *,
        action_id: str,
        label: str,
        spec: CommandSpec,
        on_finished,
    ) -> bool:
        self._session_state.command_state = CommandState.RUNNING
        self._session_state.running_action_id = action_id
        self._append_log(
            LogLevel.INFO,
            f"Running {label}",
            details=spec.display_text(),
            action_id=action_id,
        )
        self.state_changed.emit()
        self._command_runner.run(spec, on_finished)
        return True

    def _start_aws_s3_object_refresh(self, bucket_name: str, *, preferred_object_key: str | None = None) -> bool:
        available, reason = self.aws_s3_availability()
        if not available:
            self._session_state.aws_s3_workspace.bucket_status_message = reason
            self._append_log(LogLevel.WARNING, reason, action_id="aws-s3-objects")
            self.state_changed.emit()
            return False
        if self._session_state.command_state == CommandState.RUNNING:
            message = "Wait for the current command to finish before refreshing bucket contents."
            self._session_state.aws_s3_workspace.bucket_status_message = message
            self._append_log(LogLevel.WARNING, message, action_id="aws-s3-objects")
            self.state_changed.emit()
            return False

        profile = self.locked_profile()
        if profile is None:
            return False

        state = self._session_state.aws_s3_workspace
        prefix_filter = state.prefix_filter
        state.selected_bucket_name = bucket_name
        state.objects = ()
        state.selected_object_key = preferred_object_key
        state.object_metadata = ()
        state.object_status_message = (
            f"Prefix filter active: {prefix_filter}"
            if prefix_filter
            else "Select an object to inspect its metadata."
        )
        self._reset_s3_signed_url_state(state)
        state.bucket_status_message = (
            f"Loading objects for {bucket_name} with prefix {prefix_filter}..."
            if prefix_filter
            else f"Loading objects for {bucket_name}..."
        )
        args = [
            "s3api",
            "list-objects-v2",
            "--bucket",
            bucket_name,
            "--max-items",
            "200",
        ]
        if prefix_filter:
            args.extend(["--prefix", prefix_filter])
        args.extend(["--profile", profile.profile_id, "--output", "json", "--no-cli-pager"])
        spec = CommandSpec(
            action_id="aws-s3-objects",
            execution_type=CommandExecutionType.PROCESS,
            program="aws",
            args=tuple(args),
            summary=f"List S3 objects for bucket {bucket_name}",
        )
        return self._run_process_command(
            action_id="aws-s3-objects",
            label=f"S3 Objects for {bucket_name}",
            spec=spec,
            on_finished=lambda result: self._finish_aws_s3_object_refresh(bucket_name, result),
        )

    def _start_aws_s3_object_metadata_refresh(self, bucket_name: str, object_key: str) -> bool:
        available, reason = self.aws_s3_availability()
        if not available:
            self._session_state.aws_s3_workspace.object_status_message = reason
            self._append_log(LogLevel.WARNING, reason, action_id="aws-s3-object-details")
            self.state_changed.emit()
            return False
        if self._session_state.command_state == CommandState.RUNNING:
            message = "Wait for the current command to finish before refreshing object metadata."
            self._session_state.aws_s3_workspace.object_status_message = message
            self._append_log(LogLevel.WARNING, message, action_id="aws-s3-object-details")
            self.state_changed.emit()
            return False

        profile = self.locked_profile()
        if profile is None:
            return False

        self._session_state.aws_s3_workspace.selected_bucket_name = bucket_name
        self._session_state.aws_s3_workspace.selected_object_key = object_key
        self._session_state.aws_s3_workspace.object_metadata = ()
        self._session_state.aws_s3_workspace.object_status_message = (
            f"Loading metadata for {object_key}..."
        )
        self._reset_s3_signed_url_state(self._session_state.aws_s3_workspace)
        spec = CommandSpec(
            action_id="aws-s3-object-details",
            execution_type=CommandExecutionType.PROCESS,
            program="aws",
            args=(
                "s3api",
                "head-object",
                "--bucket",
                bucket_name,
                "--key",
                object_key,
                "--profile",
                profile.profile_id,
                "--output",
                "json",
                "--no-cli-pager",
            ),
            summary=f"Load metadata for {object_key}",
        )
        return self._run_process_command(
            action_id="aws-s3-object-details",
            label=f"S3 Object Metadata for {object_key}",
            spec=spec,
            on_finished=lambda result: self._finish_aws_s3_object_metadata_refresh(bucket_name, object_key, result),
        )

    def _start_aws_s3_upload(
        self,
        bucket_name: str,
        source_path: Path,
        object_key: str,
        file_size: int,
        bucket_region: str,
    ) -> bool:
        available, reason = self.aws_s3_availability()
        if not available:
            self._session_state.aws_s3_workspace.upload_status_message = reason
            self._append_log(LogLevel.WARNING, reason, action_id="aws-s3-upload")
            self.state_changed.emit()
            return False
        if self._session_state.command_state == CommandState.RUNNING:
            message = "Wait for the current command to finish before starting an upload."
            self._session_state.aws_s3_workspace.upload_status_message = message
            self._append_log(LogLevel.WARNING, message, action_id="aws-s3-upload")
            self.state_changed.emit()
            return False

        profile = self.locked_profile()
        if profile is None:
            return False

        state = self._session_state.aws_s3_workspace
        state.selected_bucket_name = bucket_name
        state.upload_source_path = str(source_path)
        state.upload_object_key = object_key
        state.upload_status_message = (
            f"Uploading {source_path.name} to s3://{bucket_name}/{object_key} "
            f"using {self._aws_s3_upload_mode_label(file_size)}..."
        )
        spec = CommandSpec(
            action_id="aws-s3-upload",
            execution_type=CommandExecutionType.PROCESS,
            program="aws",
            args=(
                "s3",
                "cp",
                str(source_path),
                f"s3://{bucket_name}/{object_key}",
                "--profile",
                profile.profile_id,
                "--region",
                bucket_region,
                "--only-show-errors",
                "--no-progress",
                "--no-cli-pager",
            ),
            summary=f"Upload {source_path.name} to {bucket_name}/{object_key}",
        )
        return self._run_process_command(
            action_id="aws-s3-upload",
            label=f"S3 Upload for {source_path.name}",
            spec=spec,
            on_finished=lambda result: self._finish_aws_s3_upload(bucket_name, object_key, file_size, result),
        )

    def _start_aws_s3_upload_bucket_region_lookup(
        self,
        bucket_name: str,
        source_path: Path,
        object_key: str,
        file_size: int,
    ) -> bool:
        available, reason = self.aws_s3_availability()
        if not available:
            self._session_state.aws_s3_workspace.upload_status_message = reason
            self._append_log(LogLevel.WARNING, reason, action_id="aws-s3-upload-region")
            self.state_changed.emit()
            return False
        if self._session_state.command_state == CommandState.RUNNING:
            message = "Wait for the current command to finish before resolving the bucket region."
            self._session_state.aws_s3_workspace.upload_status_message = message
            self._append_log(LogLevel.WARNING, message, action_id="aws-s3-upload-region")
            self.state_changed.emit()
            return False

        profile = self.locked_profile()
        if profile is None:
            return False

        state = self._session_state.aws_s3_workspace
        state.selected_bucket_name = bucket_name
        state.upload_source_path = str(source_path)
        state.upload_object_key = object_key
        state.upload_status_message = f"Resolving the bucket region for upload into {bucket_name}..."
        spec = CommandSpec(
            action_id="aws-s3-upload-region",
            execution_type=CommandExecutionType.PROCESS,
            program="aws",
            args=(
                "s3api",
                "head-bucket",
                "--bucket",
                bucket_name,
                "--profile",
                profile.profile_id,
                "--query",
                "BucketRegion",
                "--output",
                "text",
                "--no-cli-pager",
            ),
            summary=f"Resolve the bucket region for upload into {bucket_name}",
        )
        return self._run_process_command(
            action_id="aws-s3-upload-region",
            label=f"S3 Upload Region for {bucket_name}",
            spec=spec,
            on_finished=lambda result: self._finish_aws_s3_upload_bucket_region_lookup(
                bucket_name,
                source_path,
                object_key,
                file_size,
                result,
            ),
        )

    def _start_aws_s3_signed_url_generation(
        self,
        bucket_name: str,
        object_key: str,
        duration_seconds: int,
        bucket_region: str,
    ) -> bool:
        available, reason = self.aws_s3_availability()
        if not available:
            self._session_state.aws_s3_workspace.signed_url_status_message = reason
            self._append_log(LogLevel.WARNING, reason, action_id="aws-s3-signed-url")
            self.state_changed.emit()
            return False
        if self._session_state.command_state == CommandState.RUNNING:
            message = "Wait for the current command to finish before generating a signed URL."
            self._session_state.aws_s3_workspace.signed_url_status_message = message
            self._append_log(LogLevel.WARNING, message, action_id="aws-s3-signed-url")
            self.state_changed.emit()
            return False

        profile = self.locked_profile()
        if profile is None:
            return False

        state = self._session_state.aws_s3_workspace
        state.selected_bucket_name = bucket_name
        state.selected_object_key = object_key
        state.signed_url = ""
        state.signed_url_status_message = f"Generating a signed URL for {object_key}..."
        args = [
            "s3",
            "presign",
            f"s3://{bucket_name}/{object_key}",
            "--expires-in",
            str(duration_seconds),
            "--profile",
            profile.profile_id,
            "--region",
            bucket_region,
        ]
        args.append("--no-cli-pager")
        spec = CommandSpec(
            action_id="aws-s3-signed-url",
            execution_type=CommandExecutionType.PROCESS,
            program="aws",
            args=tuple(args),
            summary=f"Generate a signed URL for {object_key}",
        )
        return self._run_process_command(
            action_id="aws-s3-signed-url",
            label=f"S3 Signed URL for {object_key}",
            spec=spec,
            on_finished=lambda result: self._finish_aws_s3_signed_url_generation(
                bucket_name,
                object_key,
                result,
            ),
        )

    def _start_aws_s3_bucket_region_lookup(
        self,
        bucket_name: str,
        object_key: str,
        duration_seconds: int,
    ) -> bool:
        available, reason = self.aws_s3_availability()
        if not available:
            self._session_state.aws_s3_workspace.signed_url_status_message = reason
            self._append_log(LogLevel.WARNING, reason, action_id="aws-s3-bucket-region")
            self.state_changed.emit()
            return False
        if self._session_state.command_state == CommandState.RUNNING:
            message = "Wait for the current command to finish before resolving the bucket region."
            self._session_state.aws_s3_workspace.signed_url_status_message = message
            self._append_log(LogLevel.WARNING, message, action_id="aws-s3-bucket-region")
            self.state_changed.emit()
            return False

        profile = self.locked_profile()
        if profile is None:
            return False

        state = self._session_state.aws_s3_workspace
        state.selected_bucket_name = bucket_name
        state.selected_object_key = object_key
        state.signed_url = ""
        state.signed_url_status_message = f"Resolving the bucket region for {bucket_name}..."
        spec = CommandSpec(
            action_id="aws-s3-bucket-region",
            execution_type=CommandExecutionType.PROCESS,
            program="aws",
            args=(
                "s3api",
                "head-bucket",
                "--bucket",
                bucket_name,
                "--profile",
                profile.profile_id,
                "--query",
                "BucketRegion",
                "--output",
                "text",
                "--no-cli-pager",
            ),
            summary=f"Resolve the bucket region for {bucket_name}",
        )
        return self._run_process_command(
            action_id="aws-s3-bucket-region",
            label=f"S3 Bucket Region for {bucket_name}",
            spec=spec,
            on_finished=lambda result: self._finish_aws_s3_bucket_region_lookup(
                bucket_name,
                object_key,
                duration_seconds,
                result,
            ),
        )

    def _finish_aws_s3_bucket_refresh(self, profile_id: str, result: CommandResult) -> None:
        self._session_state.command_state = CommandState.IDLE
        self._session_state.running_action_id = None
        state = self._session_state.aws_s3_workspace
        if not result.succeeded:
            failure_message = self._command_failure_summary(result, "S3 bucket refresh failed.")
            state.status_message = failure_message
            state.bucket_status_message = failure_message
            state.buckets = ()
            state.bucket_regions = {}
            state.selected_bucket_name = None
            state.objects = ()
            state.selected_object_key = None
            state.object_metadata = ()
            state.object_status_message = failure_message
            self._reset_s3_signed_url_state(state, reason=failure_message)
            self._refresh_aws_s3_upload_status()
            self._append_log(LogLevel.ERROR, failure_message, details=result.stderr or result.stdout, action_id="aws-s3-buckets")
            self.state_changed.emit()
            return

        try:
            payload = json.loads(result.stdout or "{}")
        except json.JSONDecodeError:
            payload = {}

        buckets = tuple(
            sorted(
                (
                    S3BucketSummary(
                        name=str(bucket.get("Name") or "").strip(),
                        created_at=self._format_s3_timestamp(str(bucket.get("CreationDate") or "").strip()),
                        summary="Available bucket",
                    )
                    for bucket in payload.get("Buckets", ())
                    if str(bucket.get("Name") or "").strip()
                ),
                key=lambda bucket: bucket.name.lower(),
            )
        )
        state.buckets = buckets
        state.bucket_regions = {
            bucket_name: region
            for bucket_name, region in state.bucket_regions.items()
            if bucket_name in {bucket.name for bucket in buckets}
        }
        state.status_message = f"Loaded {len(buckets)} S3 buckets for {profile_id}."
        if not buckets:
            state.selected_bucket_name = None
            state.objects = ()
            state.selected_object_key = None
            state.object_metadata = ()
            state.bucket_status_message = "No buckets were returned for this locked AWS session."
            state.object_status_message = "No object metadata is available."
            self._reset_s3_signed_url_state(state, reason="No signed URL is available.")
            self._refresh_aws_s3_upload_status()
            self._append_log(LogLevel.SUCCESS, state.status_message, action_id="aws-s3-buckets")
            self.state_changed.emit()
            return

        current_bucket_name = state.selected_bucket_name
        if current_bucket_name not in {bucket.name for bucket in buckets}:
            current_bucket_name = buckets[0].name
        state.selected_bucket_name = current_bucket_name
        state.objects = ()
        state.selected_object_key = None
        state.object_metadata = ()
        if state.prefix_filter:
            state.object_status_message = f"Prefix filter active: {state.prefix_filter}"
        else:
            state.object_status_message = "Select an object to inspect its metadata."
        self._reset_s3_signed_url_state(state)
        state.bucket_status_message = f"Loading objects for {current_bucket_name}..."
        self._refresh_aws_s3_upload_status()
        self._append_log(LogLevel.SUCCESS, state.status_message, action_id="aws-s3-buckets")
        self.state_changed.emit()
        self._start_aws_s3_object_refresh(current_bucket_name)

    def _finish_aws_s3_object_refresh(self, bucket_name: str, result: CommandResult) -> None:
        self._session_state.command_state = CommandState.IDLE
        self._session_state.running_action_id = None
        state = self._session_state.aws_s3_workspace
        if not result.succeeded:
            failure_message = self._command_failure_summary(result, f"S3 object refresh failed for {bucket_name}.")
            state.objects = ()
            state.selected_bucket_name = bucket_name
            state.selected_object_key = None
            state.object_metadata = ()
            state.bucket_status_message = failure_message
            state.object_status_message = failure_message
            self._reset_s3_signed_url_state(state, reason=failure_message)
            self._append_log(LogLevel.ERROR, failure_message, details=result.stderr or result.stdout, action_id="aws-s3-objects")
            self.state_changed.emit()
            return

        try:
            payload = json.loads(result.stdout or "{}")
        except json.JSONDecodeError:
            payload = {}

        objects = tuple(
            S3ObjectSummary(
                key=str(item.get("Key") or "").strip(),
                size=self._format_s3_size(int(item.get("Size") or 0)),
                modified_at=self._format_s3_timestamp(str(item.get("LastModified") or "").strip()),
                storage_class=str(item.get("StorageClass") or "").strip(),
                etag=str(item.get("ETag") or "").strip().strip('"'),
            )
            for item in payload.get("Contents", ())
            if str(item.get("Key") or "").strip()
        )
        state.selected_bucket_name = bucket_name
        state.objects = objects
        state.object_metadata = ()
        if objects:
            prefix_suffix = f" matching {state.prefix_filter}" if state.prefix_filter else ""
            state.bucket_status_message = f"Loaded {len(objects)} objects from {bucket_name}{prefix_suffix}."
            selected_object_key = state.selected_object_key
            if selected_object_key not in {obj.key for obj in objects}:
                selected_object_key = objects[0].key
            state.selected_object_key = selected_object_key
            state.object_status_message = f"Loading metadata for {selected_object_key}..."
            self._reset_s3_signed_url_state(state)
        else:
            if state.prefix_filter:
                state.bucket_status_message = f"No objects matched prefix {state.prefix_filter} in {bucket_name}."
            else:
                state.bucket_status_message = f"No objects were returned for {bucket_name}."
            state.selected_object_key = None
            state.object_status_message = "No object metadata is available."
            self._reset_s3_signed_url_state(state, reason="No signed URL is available.")
        self._append_log(LogLevel.SUCCESS, state.bucket_status_message, action_id="aws-s3-objects")
        self.state_changed.emit()
        if state.selected_object_key is not None:
            self._start_aws_s3_object_metadata_refresh(bucket_name, state.selected_object_key)

    def _finish_aws_s3_object_metadata_refresh(
        self,
        bucket_name: str,
        object_key: str,
        result: CommandResult,
    ) -> None:
        self._session_state.command_state = CommandState.IDLE
        self._session_state.running_action_id = None
        state = self._session_state.aws_s3_workspace
        state.selected_bucket_name = bucket_name
        state.selected_object_key = object_key
        if not result.succeeded:
            failure_message = self._command_failure_summary(
                result,
                f"S3 metadata refresh failed for {object_key}.",
            )
            state.object_metadata = ()
            state.object_status_message = failure_message
            self._reset_s3_signed_url_state(state)
            self._append_log(
                LogLevel.ERROR,
                failure_message,
                details=result.stderr or result.stdout,
                action_id="aws-s3-object-details",
            )
            self.state_changed.emit()
            return

        try:
            payload = json.loads(result.stdout or "{}")
        except json.JSONDecodeError:
            payload = {}

        state.object_metadata = self._build_s3_object_metadata(bucket_name, object_key, payload)
        state.object_status_message = f"Loaded metadata for {object_key}."
        self._reset_s3_signed_url_state(state)
        self._append_log(
            LogLevel.SUCCESS,
            state.object_status_message,
            action_id="aws-s3-object-details",
        )
        self.state_changed.emit()

    def _finish_aws_s3_upload(
        self,
        bucket_name: str,
        object_key: str,
        file_size: int,
        result: CommandResult,
    ) -> None:
        self._session_state.command_state = CommandState.IDLE
        self._session_state.running_action_id = None
        state = self._session_state.aws_s3_workspace
        state.selected_bucket_name = bucket_name
        state.upload_object_key = object_key
        source_path = self._aws_s3_upload_source_file()
        source_label = source_path.name if source_path is not None else object_key
        destination_uri = f"s3://{bucket_name}/{object_key}"
        mode_label = self._aws_s3_upload_mode_label(file_size)
        if not result.succeeded:
            failure_message = self._command_failure_summary(
                result,
                f"Upload failed for {source_label}.",
            )
            state.upload_status_message = failure_message
            self._append_log(
                LogLevel.ERROR,
                failure_message,
                details=result.stderr or result.stdout,
                action_id="aws-s3-upload",
            )
            self.state_changed.emit()
            return

        state.upload_status_message = f"Uploaded {source_label} to {destination_uri} using {mode_label}."
        self._append_log(
            LogLevel.SUCCESS,
            state.upload_status_message,
            details=f"{state.upload_source_path}\n{destination_uri}",
            action_id="aws-s3-upload",
        )
        self.state_changed.emit()
        if self._aws_s3_prefix_allows_object(object_key):
            self._start_aws_s3_object_refresh(bucket_name, preferred_object_key=object_key)
            return
        state.bucket_status_message = (
            f"Upload completed, but {object_key} is outside the current prefix filter."
        )
        self.state_changed.emit()

    def _finish_aws_s3_upload_bucket_region_lookup(
        self,
        bucket_name: str,
        source_path: Path,
        object_key: str,
        file_size: int,
        result: CommandResult,
    ) -> None:
        self._session_state.command_state = CommandState.IDLE
        self._session_state.running_action_id = None
        if not result.succeeded:
            failure_message = self._command_failure_summary(
                result,
                f"Bucket region lookup failed for upload into {bucket_name}.",
            )
            self._session_state.aws_s3_workspace.upload_status_message = failure_message
            self._append_log(
                LogLevel.ERROR,
                failure_message,
                details=result.stderr or result.stdout,
                action_id="aws-s3-upload-region",
            )
            self.state_changed.emit()
            return

        bucket_region = (result.stdout or "").strip() or "us-east-1"
        self._session_state.aws_s3_workspace.bucket_regions[bucket_name] = bucket_region
        self._append_log(
            LogLevel.SUCCESS,
            f"Resolved bucket region for upload into {bucket_name}: {bucket_region}.",
            action_id="aws-s3-upload-region",
        )
        self.state_changed.emit()
        self._start_aws_s3_upload(bucket_name, source_path, object_key, file_size, bucket_region)

    def _finish_aws_s3_signed_url_generation(
        self,
        bucket_name: str,
        object_key: str,
        result: CommandResult,
    ) -> None:
        self._session_state.command_state = CommandState.IDLE
        self._session_state.running_action_id = None
        state = self._session_state.aws_s3_workspace
        state.selected_bucket_name = bucket_name
        state.selected_object_key = object_key
        if not result.succeeded:
            failure_message = self._command_failure_summary(
                result,
                f"Signed URL generation failed for {object_key}.",
            )
            state.signed_url = ""
            state.signed_url_status_message = failure_message
            self._append_log(
                LogLevel.ERROR,
                failure_message,
                details=result.stderr or result.stdout,
                action_id="aws-s3-signed-url",
            )
            self.state_changed.emit()
            return

        signed_url = next((line.strip() for line in result.stdout.splitlines() if line.strip()), "")
        if not signed_url:
            state.signed_url = ""
            state.signed_url_status_message = "AWS CLI returned no signed URL."
            self._append_log(
                LogLevel.ERROR,
                state.signed_url_status_message,
                action_id="aws-s3-signed-url",
            )
            self.state_changed.emit()
            return

        state.signed_url = signed_url
        state.signed_url_status_message = (
            f"Generated a signed URL for {object_key} with a {self._format_s3_signed_url_duration()} duration."
        )
        self._append_log(
            LogLevel.SUCCESS,
            state.signed_url_status_message,
            details=signed_url,
            action_id="aws-s3-signed-url",
        )
        self.state_changed.emit()

    def _finish_aws_s3_bucket_region_lookup(
        self,
        bucket_name: str,
        object_key: str,
        duration_seconds: int,
        result: CommandResult,
    ) -> None:
        self._session_state.command_state = CommandState.IDLE
        self._session_state.running_action_id = None
        if not result.succeeded:
            failure_message = self._command_failure_summary(
                result,
                f"Bucket region lookup failed for {bucket_name}.",
            )
            self._session_state.aws_s3_workspace.signed_url_status_message = failure_message
            self._append_log(
                LogLevel.ERROR,
                failure_message,
                details=result.stderr or result.stdout,
                action_id="aws-s3-bucket-region",
            )
            self.state_changed.emit()
            return

        bucket_region = (result.stdout or "").strip() or "us-east-1"
        self._session_state.aws_s3_workspace.bucket_regions[bucket_name] = bucket_region
        self._append_log(
            LogLevel.SUCCESS,
            f"Resolved bucket region for {bucket_name}: {bucket_region}.",
            action_id="aws-s3-bucket-region",
        )
        self.state_changed.emit()
        self._start_aws_s3_signed_url_generation(
            bucket_name,
            object_key,
            duration_seconds,
            bucket_region,
        )

    def _finish_aws_s3_test_url_validation(self, result: UrlValidationResult) -> None:
        self._session_state.command_state = CommandState.IDLE
        self._session_state.running_action_id = None
        self._apply_url_test_analysis(result.url, extra_fields=result.detail_fields)
        self._session_state.aws_s3_workspace.url_tester_status_message = result.summary
        self._append_log(
            LogLevel.SUCCESS if result.succeeded else LogLevel.ERROR,
            result.summary,
            action_id="aws-s3-url-validate",
        )
        self.state_changed.emit()

    def _reset_aws_s3_workspace(self) -> None:
        state = self._session_state.aws_s3_workspace
        available, reason = self.aws_s3_availability()
        state.buckets = ()
        state.bucket_regions = {}
        state.selected_bucket_name = None
        state.objects = ()
        state.selected_object_key = None
        state.object_metadata = ()
        state.upload_source_path = ""
        state.upload_object_key = ""
        state.signed_url = ""
        state.url_tester_input = ""
        state.url_tester_detail_fields = ()
        if available:
            profile = self.locked_profile()
            profile_id = profile.profile_id if profile is not None else "locked profile"
            state.status_message = f"S3 workspace ready for {profile_id}. Refresh buckets to begin."
            state.bucket_status_message = "Refresh buckets to load S3 buckets."
            state.object_status_message = "Select an object to inspect its metadata."
            state.upload_status_message = "Select a bucket and choose a local file to upload."
            state.signed_url_status_message = "Select an object to generate a signed URL."
            state.url_tester_status_message = "Paste any URL to inspect it or validate it."
            return
        state.status_message = reason
        state.bucket_status_message = reason
        state.object_status_message = reason
        state.upload_status_message = reason
        state.signed_url_status_message = reason
        state.url_tester_status_message = reason

    def _aws_s3_upload_source_file(self) -> Path | None:
        source_path = self._session_state.aws_s3_workspace.upload_source_path.strip()
        if not source_path:
            return None
        return Path(source_path).expanduser()

    def _default_aws_s3_upload_object_key(self, source_path: str) -> str:
        filename = Path(source_path).name
        prefix_filter = self._session_state.aws_s3_workspace.prefix_filter.strip().strip("/")
        if prefix_filter:
            return f"{prefix_filter}/{filename}"
        return filename

    def _refresh_aws_s3_upload_status(self) -> None:
        state = self._session_state.aws_s3_workspace
        available, reason = self.aws_s3_availability()
        if not available:
            state.upload_status_message = reason
            return
        if state.selected_bucket_name is None:
            state.upload_status_message = "Select a bucket before uploading a file."
            return
        source_path = self._aws_s3_upload_source_file()
        if source_path is None:
            state.upload_status_message = f"Choose a local file to upload into {state.selected_bucket_name}."
            return
        if not source_path.exists() or not source_path.is_file():
            state.upload_status_message = "The selected upload file is not available."
            return
        if not state.upload_object_key:
            state.upload_status_message = "Set the destination object key before uploading."
            return
        destination_uri = f"s3://{state.selected_bucket_name}/{state.upload_object_key}"
        file_size = source_path.stat().st_size
        upload_mode = self._aws_s3_upload_mode_label(file_size)
        if self._aws_s3_prefix_allows_object(state.upload_object_key):
            state.upload_status_message = f"Ready to upload to {destination_uri} using {upload_mode}."
            return
        state.upload_status_message = (
            f"Ready to upload to {destination_uri} using {upload_mode}. "
            "The current prefix filter will hide the new object after upload."
        )

    def _aws_s3_upload_mode_label(self, file_size: int) -> str:
        if file_size > AWS_S3_MULTIPART_THRESHOLD_BYTES:
            return "multipart upload via AWS CLI"
        return "single-file upload via AWS CLI"

    def _aws_s3_prefix_allows_object(self, object_key: str) -> bool:
        prefix_filter = self._session_state.aws_s3_workspace.prefix_filter
        if not prefix_filter:
            return True
        return object_key.startswith(prefix_filter)

    def _command_failure_summary(self, result: CommandResult, fallback: str) -> str:
        return result.stderr.strip() or result.stdout.strip() or result.summary or fallback

    def _build_s3_object_metadata(
        self,
        bucket_name: str,
        object_key: str,
        payload: dict,
    ) -> tuple[DetailField, ...]:
        metadata_fields = [
            DetailField(label="Bucket", value=bucket_name),
            DetailField(label="Key", value=object_key),
        ]

        if "ContentLength" in payload:
            metadata_fields.append(
                DetailField(label="Size", value=self._format_s3_size(int(payload.get("ContentLength") or 0)))
            )
        if payload.get("LastModified"):
            metadata_fields.append(
                DetailField(
                    label="Last Modified",
                    value=self._format_s3_timestamp(str(payload.get("LastModified") or "").strip()),
                )
            )
        if payload.get("ContentType"):
            metadata_fields.append(
                DetailField(label="Content Type", value=str(payload.get("ContentType") or "").strip())
            )
        if payload.get("StorageClass"):
            metadata_fields.append(
                DetailField(label="Storage Class", value=str(payload.get("StorageClass") or "").strip())
            )
        if payload.get("ETag"):
            metadata_fields.append(
                DetailField(label="ETag", value=str(payload.get("ETag") or "").strip().strip('"'))
            )
        if payload.get("CacheControl"):
            metadata_fields.append(
                DetailField(label="Cache Control", value=str(payload.get("CacheControl") or "").strip())
            )
        if payload.get("ContentLanguage"):
            metadata_fields.append(
                DetailField(label="Content Language", value=str(payload.get("ContentLanguage") or "").strip())
            )
        metadata_map = payload.get("Metadata") or {}
        if metadata_map:
            metadata_fields.append(
                DetailField(
                    label="User Metadata",
                    value=", ".join(f"{key}={value}" for key, value in sorted(metadata_map.items())),
                )
            )
        return tuple(metadata_fields)

    def _apply_url_test_analysis(
        self,
        url: str,
        *,
        extra_fields: tuple[DetailField, ...] = (),
    ) -> None:
        inspection = analyse_url(url)
        state = self._session_state.aws_s3_workspace
        state.url_tester_input = url
        state.url_tester_status_message = inspection.summary
        state.url_tester_detail_fields = (*inspection.detail_fields, *extra_fields)

    def _reset_s3_signed_url_state(self, state: S3WorkspaceState, *, reason: str | None = None) -> None:
        state.signed_url = ""
        if reason:
            state.signed_url_status_message = reason
            return
        if state.selected_object_key is None:
            state.signed_url_status_message = "Select an object to generate a signed URL."
            return
        state.signed_url_status_message = self._s3_signed_url_ready_message(
            state.selected_object_key,
            self._format_s3_signed_url_duration(state),
        )

    def _set_aws_s3_signed_url_duration_selection(
        self,
        duration_value: int,
        duration_unit: SignedUrlDurationUnit | str,
    ) -> bool:
        try:
            normalised_unit = SignedUrlDurationUnit(duration_unit)
        except ValueError:
            normalised_unit = SignedUrlDurationUnit.HOURS
        max_value = self._s3_signed_url_duration_max(normalised_unit)
        normalised_value = max(1, min(int(duration_value), max_value))
        state = self._session_state.aws_s3_workspace
        if (
            normalised_value == state.signed_url_duration_value
            and normalised_unit == state.signed_url_duration_unit
        ):
            return False
        state.signed_url_duration_value = normalised_value
        state.signed_url_duration_unit = normalised_unit
        self._reset_s3_signed_url_state(state)
        self.state_changed.emit()
        return True

    def _aws_s3_signed_url_duration_seconds(self) -> int:
        state = self._session_state.aws_s3_workspace
        multiplier = 86400 if state.signed_url_duration_unit == SignedUrlDurationUnit.DAYS else 3600
        return state.signed_url_duration_value * multiplier

    def _format_s3_signed_url_duration(self, state: S3WorkspaceState | None = None) -> str:
        state = state or self._session_state.aws_s3_workspace
        unit = state.signed_url_duration_unit
        value = state.signed_url_duration_value
        singular = "day" if unit == SignedUrlDurationUnit.DAYS else "hour"
        plural = "days" if unit == SignedUrlDurationUnit.DAYS else "hours"
        return f"{value} {singular if value == 1 else plural}"

    def _s3_signed_url_duration_max(self, duration_unit: SignedUrlDurationUnit) -> int:
        return 7 if duration_unit == SignedUrlDurationUnit.DAYS else 168

    def _s3_signed_url_ready_message(self, object_key: str, duration_label: str) -> str:
        return f"Ready to generate a signed URL for {object_key} with a {duration_label} duration."

    def _format_s3_timestamp(self, value: str) -> str:
        if not value:
            return ""
        try:
            parsed = datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(UTC)
        except ValueError:
            return value
        return parsed.strftime("%Y-%m-%d %H:%M UTC")

    def _format_s3_size(self, size_bytes: int) -> str:
        if size_bytes < 1024:
            return f"{size_bytes} B"
        if size_bytes < 1024 * 1024:
            return f"{size_bytes / 1024:.1f} KiB"
        if size_bytes < 1024 * 1024 * 1024:
            return f"{size_bytes / (1024 * 1024):.1f} MiB"
        return f"{size_bytes / (1024 * 1024 * 1024):.1f} GiB"

    def _append_log(
        self,
        level: LogLevel,
        message: str,
        *,
        details: str = "",
        action_id: str | None = None,
    ) -> None:
        self._session_state.recent_logs.append(
            LogEntry(level=level, message=message, details=details, action_id=action_id)
        )
        self._session_state.recent_logs[:] = self._session_state.recent_logs[-50:]

    def _current_adapter(self) -> ProviderAdapter | None:
        provider_id = self._session_state.current_provider_id
        if provider_id is None:
            return None
        return self._provider_adapters.get(provider_id)

    def _reconcile_selection(self) -> None:
        provider_ids = [provider.provider_id for provider in self._provider_snapshot]
        if not provider_ids:
            self._session_state.current_provider_id = None
            self._session_state.selected_profile_id = None
            return

        if self._session_state.current_provider_id not in provider_ids:
            self._session_state.current_provider_id = provider_ids[0]

        profiles = self.profiles_for_provider(self._session_state.current_provider_id)
        if not profiles:
            self._session_state.selected_profile_id = None
            return

        valid_profile_ids = {profile.profile_id for profile in profiles}
        if self._session_state.selected_profile_id not in valid_profile_ids:
            self._session_state.selected_profile_id = profiles[0].profile_id

    def _reconcile_auth_selection(self) -> None:
        provider_id = self._session_state.current_provider_id
        if provider_id is None:
            return
        available_methods = tuple(
            method for method in self.available_auth_methods() if method.available
        )
        if not available_methods:
            self._session_state.selected_auth_method_by_provider.pop(provider_id, None)
            return
        selected_method = self._session_state.selected_auth_method(provider_id)
        available_method_ids = {method.method for method in available_methods}
        if selected_method not in available_method_ids:
            self._session_state.selected_auth_method_by_provider[provider_id] = available_methods[0].method

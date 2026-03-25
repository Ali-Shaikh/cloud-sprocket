from __future__ import annotations

from collections.abc import Sequence
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
    CommandState,
    DiscoveryReport,
    LogEntry,
    LogLevel,
    ProfileDetails,
    ProviderAction,
    ProviderHealth,
    SessionState,
    WorkspaceTab,
)
from cloudsprocket.services.auth import AuthStatusService
from cloudsprocket.services.command_runner import BackgroundCommandRunner
from cloudsprocket.services.profile_discovery import ProfileDiscoveryService
from cloudsprocket.services.provider_actions import ProviderAdapter, create_provider_adapters


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
        desktop_integration: DesktopIntegration | None = None,
    ) -> None:
        super().__init__()
        self._settings = settings
        self._auth_service = auth_service
        self._profile_discovery = profile_discovery
        self._provider_adapters = provider_adapters or create_provider_adapters(settings)
        self._command_runner = command_runner or BackgroundCommandRunner()
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

    def workspace_tabs(self) -> tuple[WorkspaceTab, ...]:
        if not self.is_session_locked():
            return ()
        provider_id = self._session_state.locked_provider_id or ""
        auth_method = self._session_state.locked_auth_method
        auth_label = auth_method.value.upper() if auth_method else "UNKNOWN"
        if provider_id == "aws":
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
                    summary="Bucket and object workspace placeholder.",
                    detail="This tab will become the focused S3 workspace for the locked AWS session.",
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
            self._session_state.command_state = CommandState.RUNNING
            self._session_state.running_action_id = action.action_id
            self._append_log(
                LogLevel.INFO,
                f"Running {action.label}",
                details=spec.display_text(),
                action_id=action.action_id,
            )
            self.state_changed.emit()
            self._command_runner.run(
                spec,
                lambda result: self._finish_process_action(adapter, action, profile, result),
            )
            return True

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

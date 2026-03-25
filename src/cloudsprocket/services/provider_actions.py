from __future__ import annotations

import json
from dataclasses import replace
from pathlib import Path
from typing import Protocol

from cloudsprocket.config import AppSettings
from cloudsprocket.models import (
    ActionKind,
    AuthMethod,
    AuthMethodStatus,
    CommandExecutionType,
    CommandResult,
    CommandSpec,
    DetailField,
    DiscoveredProfile,
    ProfileDetails,
    ProviderAction,
    ProviderCapability,
    ProviderHealth,
    SessionState,
)


def _friendly_label(label: str) -> str:
    return label.replace("_", " ").replace("-", " ").title()


class ProviderAdapter(Protocol):
    provider_id: str
    label: str

    def list_actions(
        self,
        profile: DiscoveredProfile | None,
        session_state: SessionState,
        health: ProviderHealth | None,
    ) -> tuple[ProviderAction, ...]:
        ...

    def build_command(
        self,
        action: ProviderAction,
        profile: DiscoveredProfile | None,
        session_state: SessionState,
    ) -> CommandSpec:
        ...

    def parse_result(
        self,
        action: ProviderAction,
        profile: DiscoveredProfile | None,
        result: CommandResult,
        session_state: SessionState,
    ) -> CommandResult:
        ...

    def describe_profile(
        self,
        profile: DiscoveredProfile | None,
        session_state: SessionState,
        health: ProviderHealth | None,
    ) -> ProfileDetails:
        ...


class BaseProviderAdapter:
    def __init__(self, settings: AppSettings, *, provider_id: str, label: str) -> None:
        self._settings = settings
        self.provider_id = provider_id
        self.label = label

    def list_actions(
        self,
        profile: DiscoveredProfile | None,
        session_state: SessionState,
        health: ProviderHealth | None,
    ) -> tuple[ProviderAction, ...]:
        return (
            ProviderAction(
                action_id="refresh",
                label="Refresh",
                kind=ActionKind.REFRESH,
                auth_method=AuthMethod.LOCAL_FILES,
                description="Refresh provider health and discovered profiles.",
            ),
            ProviderAction(
                action_id="open-config",
                label="Open Config",
                kind=ActionKind.OPEN_CONFIG,
                auth_method=AuthMethod.LOCAL_FILES,
                description="Open the provider configuration folder.",
            ),
        )

    def build_command(
        self,
        action: ProviderAction,
        profile: DiscoveredProfile | None,
        session_state: SessionState,
    ) -> CommandSpec:
        if action.kind == ActionKind.REFRESH:
            return CommandSpec(
                action_id=action.action_id,
                execution_type=CommandExecutionType.INTERNAL,
                summary=f"Refresh {self.label} state",
            )
        if action.kind == ActionKind.OPEN_CONFIG:
            return CommandSpec(
                action_id=action.action_id,
                execution_type=CommandExecutionType.OPEN_PATH,
                path=self._config_path(),
                summary=f"Open {self.label} config",
            )
        raise ValueError(f"Unsupported action {action.action_id} for {self.provider_id}")

    def parse_result(
        self,
        action: ProviderAction,
        profile: DiscoveredProfile | None,
        result: CommandResult,
        session_state: SessionState,
    ) -> CommandResult:
        return result

    def describe_profile(
        self,
        profile: DiscoveredProfile | None,
        session_state: SessionState,
        health: ProviderHealth | None,
    ) -> ProfileDetails:
        if profile is None:
            return ProfileDetails(
                provider_id=self.provider_id,
                title=f"{self.label} Provider",
                subtitle="No profile selected",
                summary=f"{self.label} actions beyond refresh and config inspection are scheduled for a later phase.",
                auth_methods=(
                    AuthMethodStatus(
                        method=AuthMethod.CLI,
                        label="CLI",
                        summary=self._cli_summary(health),
                        available=bool(health and health.command_path),
                    ),
                    AuthMethodStatus(
                        method=AuthMethod.SSO,
                        label="SSO",
                        summary="Provider-specific SSO actions are not implemented in this slice.",
                        available=False,
                    ),
                    AuthMethodStatus(
                        method=AuthMethod.LOCAL_FILES,
                        label="Local files",
                        summary=f"Config folder: {self._config_path()}",
                    ),
                ),
                capabilities=(
                    ProviderCapability(
                        capability_id="coming-soon",
                        label="Provider actions",
                        summary=f"{self.label} command actions will follow the AWS implementation pattern.",
                        available=False,
                    ),
                ),
                source_paths=(self._config_path(),),
            )

        return ProfileDetails(
            provider_id=self.provider_id,
            title=profile.display_name,
            subtitle=profile.profile_id,
            summary=profile.details or f"{self.label} profile discovered from local configuration.",
            detail_fields=self._detail_fields_from_profile(profile),
            source_paths=profile.source_paths or (profile.source,),
            auth_methods=(
                AuthMethodStatus(
                    method=AuthMethod.CLI,
                    label="CLI",
                    summary=self._cli_summary(health),
                    available=bool(health and health.command_path),
                ),
                AuthMethodStatus(
                    method=AuthMethod.SSO,
                    label="SSO",
                    summary="Provider-specific SSO actions are not implemented in this slice.",
                    available=False,
                ),
                AuthMethodStatus(
                    method=AuthMethod.LOCAL_FILES,
                    label="Local files",
                    summary="Profile data is visible but remains read-only in v1.",
                ),
            ),
            capabilities=(
                ProviderCapability(
                    capability_id="read-only",
                    label="Read-only discovery",
                    summary="Local configuration is inspectable, but editing is out of scope for v1.",
                ),
            ),
            notes=("AWS is the full reference provider in this slice.",),
        )

    def _cli_summary(self, health: ProviderHealth | None) -> str:
        if health and health.command_path:
            return f"CLI available at {health.command_path}"
        return f"{self.label} CLI is not currently available."

    def _detail_fields_from_profile(self, profile: DiscoveredProfile) -> tuple[DetailField, ...]:
        return tuple(
            DetailField(
                label=_friendly_label(field.label),
                value=field.value,
                sensitive=field.sensitive,
            )
            for field in profile.attributes
        )

    def _config_path(self) -> Path:
        raise NotImplementedError


class AwsProviderAdapter(BaseProviderAdapter):
    def __init__(self, settings: AppSettings) -> None:
        super().__init__(settings, provider_id="aws", label="AWS")

    def list_actions(
        self,
        profile: DiscoveredProfile | None,
        session_state: SessionState,
        health: ProviderHealth | None,
    ) -> tuple[ProviderAction, ...]:
        has_cli = bool(health and health.command_path)
        selected_profile = profile is not None
        is_active = bool(
            profile and session_state.active_profile_id(self.provider_id) == profile.profile_id
        )
        is_sso = bool(profile and self._is_sso_profile(profile))
        profile_reason = "Select an AWS profile to enable this action."
        cli_reason = "AWS CLI was not detected on this machine."
        sso_reason = "The selected profile does not contain AWS SSO settings."

        return (
            ProviderAction(
                action_id="refresh",
                label="Refresh",
                kind=ActionKind.REFRESH,
                auth_method=AuthMethod.LOCAL_FILES,
                description="Refresh AWS health and discovered profiles.",
            ),
            ProviderAction(
                action_id="whoami",
                label="Who Am I",
                kind=ActionKind.WHOAMI,
                auth_method=AuthMethod.CLI,
                enabled=selected_profile and has_cli,
                requires_profile=True,
                description="Run sts get-caller-identity for the selected profile.",
                disabled_reason=profile_reason if not selected_profile else cli_reason if not has_cli else None,
            ),
            ProviderAction(
                action_id="sso-login",
                label="SSO Login",
                kind=ActionKind.SSO_LOGIN,
                auth_method=AuthMethod.SSO,
                enabled=selected_profile and has_cli and is_sso,
                requires_profile=True,
                description="Start the AWS SSO login flow for the selected profile.",
                disabled_reason=(
                    profile_reason
                    if not selected_profile
                    else cli_reason
                    if not has_cli
                    else sso_reason
                    if not is_sso
                    else None
                ),
            ),
            ProviderAction(
                action_id="logout",
                label="Logout",
                kind=ActionKind.LOGOUT,
                auth_method=AuthMethod.SSO,
                enabled=has_cli,
                description="Run aws sso logout. This clears cached SSO sessions.",
                disabled_reason=cli_reason if not has_cli else None,
            ),
            ProviderAction(
                action_id="activate",
                label="Activate",
                kind=ActionKind.ACTIVATE,
                auth_method=AuthMethod.LOCAL_FILES,
                enabled=selected_profile and not is_active,
                requires_profile=True,
                description="Make the selected profile active inside CloudSprocket.",
                disabled_reason=(
                    profile_reason if not selected_profile else "This profile is already active in CloudSprocket."
                ) if (not selected_profile or is_active) else None,
            ),
            ProviderAction(
                action_id="open-config",
                label="Open Config",
                kind=ActionKind.OPEN_CONFIG,
                auth_method=AuthMethod.LOCAL_FILES,
                description="Open the AWS configuration directory.",
            ),
            ProviderAction(
                action_id="copy-export",
                label="Copy Export Snippet",
                kind=ActionKind.COPY_EXPORT,
                auth_method=AuthMethod.LOCAL_FILES,
                enabled=selected_profile,
                requires_profile=True,
                description="Copy shell snippets for using the selected profile outside the app.",
                disabled_reason=profile_reason if not selected_profile else None,
            ),
        )

    def build_command(
        self,
        action: ProviderAction,
        profile: DiscoveredProfile | None,
        session_state: SessionState,
    ) -> CommandSpec:
        if action.kind == ActionKind.REFRESH:
            return super().build_command(action, profile, session_state)
        if action.kind == ActionKind.OPEN_CONFIG:
            return CommandSpec(
                action_id=action.action_id,
                execution_type=CommandExecutionType.OPEN_PATH,
                path=self._config_path(),
                summary="Open AWS configuration",
            )
        if action.kind == ActionKind.ACTIVATE and profile:
            return CommandSpec(
                action_id=action.action_id,
                execution_type=CommandExecutionType.INTERNAL,
                summary=f"Activate AWS profile {profile.profile_id}",
            )
        if action.kind == ActionKind.COPY_EXPORT and profile:
            return CommandSpec(
                action_id=action.action_id,
                execution_type=CommandExecutionType.COPY_TEXT,
                clipboard_text=self.export_snippet(profile.profile_id),
                summary=f"Copy export snippet for AWS profile {profile.profile_id}",
            )
        if action.kind == ActionKind.WHOAMI and profile:
            return CommandSpec(
                action_id=action.action_id,
                execution_type=CommandExecutionType.PROCESS,
                program="aws",
                args=("sts", "get-caller-identity", "--profile", profile.profile_id, "--output", "json"),
                summary=f"Check caller identity for AWS profile {profile.profile_id}",
            )
        if action.kind == ActionKind.SSO_LOGIN and profile:
            return CommandSpec(
                action_id=action.action_id,
                execution_type=CommandExecutionType.PROCESS,
                program="aws",
                args=("sso", "login", "--profile", profile.profile_id),
                summary=f"Run AWS SSO login for profile {profile.profile_id}",
            )
        if action.kind == ActionKind.LOGOUT:
            return CommandSpec(
                action_id=action.action_id,
                execution_type=CommandExecutionType.PROCESS,
                program="aws",
                args=("sso", "logout"),
                summary="Run AWS SSO logout",
            )
        raise ValueError(f"Unsupported AWS action {action.action_id}")

    def parse_result(
        self,
        action: ProviderAction,
        profile: DiscoveredProfile | None,
        result: CommandResult,
        session_state: SessionState,
    ) -> CommandResult:
        if action.kind == ActionKind.WHOAMI and result.succeeded:
            try:
                payload = json.loads(result.stdout or "{}")
            except json.JSONDecodeError:
                payload = {}
            arn = str(payload.get("Arn") or "").strip()
            account = str(payload.get("Account") or "").strip()
            summary = f"AWS identity check succeeded for {profile.profile_id if profile else 'selected profile'}."
            if arn or account:
                summary = ", ".join(part for part in (account, arn) if part)
            return replace(result, summary=summary)
        if action.kind == ActionKind.SSO_LOGIN and result.succeeded:
            return replace(
                result,
                summary=f"AWS SSO login completed for profile {profile.profile_id if profile else 'selected profile'}.",
            )
        if action.kind == ActionKind.LOGOUT and result.succeeded:
            return replace(
                result,
                summary="AWS SSO logout completed. Cached SSO sessions were cleared.",
            )
        if not result.succeeded:
            failure_text = result.stderr.strip() or result.stdout.strip() or result.summary
            return replace(result, summary=failure_text or f"{action.label} failed.")
        return result

    def describe_profile(
        self,
        profile: DiscoveredProfile | None,
        session_state: SessionState,
        health: ProviderHealth | None,
    ) -> ProfileDetails:
        if profile is None:
            return ProfileDetails(
                provider_id=self.provider_id,
                title="AWS Provider",
                subtitle="No profile selected",
                summary="Select an AWS profile to inspect it and run CLI or SSO actions.",
                auth_methods=(
                    AuthMethodStatus(
                        method=AuthMethod.CLI,
                        label="CLI",
                        summary=self._cli_summary(health),
                        available=bool(health and health.command_path),
                    ),
                    AuthMethodStatus(
                        method=AuthMethod.SSO,
                        label="SSO",
                        summary="SSO support becomes available when the selected profile contains AWS SSO settings.",
                        available=False,
                    ),
                    AuthMethodStatus(
                        method=AuthMethod.LOCAL_FILES,
                        label="Local files",
                        summary=f"Configuration root: {self._config_path()}",
                    ),
                ),
                capabilities=(
                    ProviderCapability(
                        capability_id="aws-actions",
                        label="AWS action set",
                        summary="AWS is the fully actionable reference provider in this slice.",
                    ),
                ),
                source_paths=(self._config_path(),),
            )

        fields = self._detail_fields_from_profile(profile)
        is_sso = self._is_sso_profile(profile)
        notes = []
        active_profile_id = session_state.active_profile_id(self.provider_id)
        if active_profile_id == profile.profile_id:
            notes.append("This profile is currently active inside CloudSprocket.")
        else:
            notes.append("Activate this profile to use it as CloudSprocket's AWS session context.")
        if is_sso:
            notes.append("AWS SSO login is available for this profile.")
            notes.append("AWS logout clears cached SSO sessions for all AWS profiles.")
        else:
            notes.append("This profile does not advertise SSO fields, so SSO login is disabled.")

        return ProfileDetails(
            provider_id=self.provider_id,
            title=profile.display_name,
            subtitle=profile.profile_id,
            summary=profile.details or "AWS profile discovered from local configuration files.",
            detail_fields=fields,
            source_paths=profile.source_paths or (profile.source,),
            auth_methods=(
                AuthMethodStatus(
                    method=AuthMethod.CLI,
                    label="CLI",
                    summary=self._cli_summary(health),
                    available=bool(health and health.command_path),
                ),
                AuthMethodStatus(
                    method=AuthMethod.SSO,
                    label="SSO",
                    summary=(
                        "AWS SSO settings were detected for this profile."
                        if is_sso
                        else "No AWS SSO settings were detected for this profile."
                    ),
                    available=is_sso,
                ),
                AuthMethodStatus(
                    method=AuthMethod.LOCAL_FILES,
                    label="Local files",
                    summary="Profile configuration is read-only in this v1 shell.",
                ),
            ),
            capabilities=(
                ProviderCapability(
                    capability_id="identity-check",
                    label="Identity check",
                    summary="Run sts get-caller-identity for the selected profile.",
                    available=bool(health and health.command_path),
                ),
                ProviderCapability(
                    capability_id="session-activate",
                    label="Session activation",
                    summary="Activate this profile inside CloudSprocket and export it to external shells.",
                ),
            ),
            notes=tuple(notes),
        )

    def export_snippet(self, profile_id: str) -> str:
        return "\n".join(
            [
                f"# CloudSprocket by Ali Shaikh: AWS profile {profile_id}",
                "# PowerShell",
                f'$env:AWS_PROFILE = "{profile_id}"',
                "",
                "# bash / zsh",
                f"export AWS_PROFILE='{profile_id}'",
            ]
        )

    def _is_sso_profile(self, profile: DiscoveredProfile) -> bool:
        attributes = profile.attribute_map()
        return any(
            key in attributes
            for key in ("sso_start_url", "sso_session", "sso_account_id", "sso_role_name")
        )

    def _config_path(self) -> Path:
        return self._settings.aws_dir


class AzureProviderAdapter(BaseProviderAdapter):
    def __init__(self, settings: AppSettings) -> None:
        super().__init__(settings, provider_id="azure", label="Azure")

    def _config_path(self) -> Path:
        return self._settings.azure_dir


class GcpProviderAdapter(BaseProviderAdapter):
    def __init__(self, settings: AppSettings) -> None:
        super().__init__(settings, provider_id="gcp", label="GCP")

    def _config_path(self) -> Path:
        return self._settings.gcloud_dir


def create_provider_adapters(settings: AppSettings) -> dict[str, ProviderAdapter]:
    return {
        "aws": AwsProviderAdapter(settings),
        "azure": AzureProviderAdapter(settings),
        "gcp": GcpProviderAdapter(settings),
    }

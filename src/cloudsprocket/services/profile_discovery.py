from __future__ import annotations

import configparser
import json
from pathlib import Path

from cloudsprocket.config import AppSettings
from cloudsprocket.models import DiscoveredProfile, DiscoveryReport, DiscoveryWarning


class ProfileDiscoveryService:
    def __init__(self, settings: AppSettings) -> None:
        self._settings = settings

    def discover(self) -> DiscoveryReport:
        profiles: list[DiscoveredProfile] = []
        warnings: list[DiscoveryWarning] = []

        aws_profiles, aws_warnings = self._discover_aws()
        azure_profiles, azure_warnings = self._discover_azure()
        gcp_profiles, gcp_warnings = self._discover_gcp()

        profiles.extend(aws_profiles)
        profiles.extend(azure_profiles)
        profiles.extend(gcp_profiles)
        warnings.extend(aws_warnings)
        warnings.extend(azure_warnings)
        warnings.extend(gcp_warnings)

        ordered_profiles = tuple(
            sorted(
                profiles,
                key=lambda profile: (
                    profile.provider_id,
                    profile.display_name.lower(),
                    profile.profile_id.lower(),
                ),
            )
        )
        ordered_warnings = tuple(
            sorted(
                warnings,
                key=lambda warning: (
                    warning.provider_id,
                    str(warning.source or ""),
                    warning.message,
                ),
            )
        )
        return DiscoveryReport(profiles=ordered_profiles, warnings=ordered_warnings)

    def _discover_aws(
        self,
    ) -> tuple[list[DiscoveredProfile], list[DiscoveryWarning]]:
        warnings: list[DiscoveryWarning] = []
        details_by_name: dict[str, dict[str, str]] = {}

        for path, trim_prefix in (
            (self._settings.aws_config_path, True),
            (self._settings.aws_credentials_path, False),
        ):
            if not path.exists():
                continue
            parser = configparser.RawConfigParser()
            try:
                parser.read(path, encoding="utf-8")
            except configparser.Error as exc:
                warnings.append(
                    DiscoveryWarning(
                        provider_id="aws",
                        message=f"Failed to parse AWS config: {exc}",
                        source=path,
                    )
                )
                continue

            for section_name in parser.sections():
                profile_name = section_name
                if trim_prefix and section_name.startswith("profile "):
                    profile_name = section_name.removeprefix("profile ").strip()

                section = {key: value for key, value in parser.items(section_name)}
                details_by_name.setdefault(profile_name, {}).update(section)

        profiles = [
            DiscoveredProfile(
                provider_id="aws",
                profile_id=profile_name,
                display_name=profile_name,
                source=(
                    self._settings.aws_config_path
                    if self._settings.aws_config_path.exists()
                    else self._settings.aws_credentials_path
                ),
                details=self._format_aws_details(section_values),
            )
            for profile_name, section_values in details_by_name.items()
        ]
        return profiles, warnings

    def _discover_azure(
        self,
    ) -> tuple[list[DiscoveredProfile], list[DiscoveryWarning]]:
        path = self._settings.azure_profile_path
        if not path.exists():
            return [], []

        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, ValueError) as exc:
            return [], [
                DiscoveryWarning(
                    provider_id="azure",
                    message=f"Failed to parse Azure profile cache: {exc}",
                    source=path,
                )
            ]

        subscriptions = payload.get("subscriptions", [])
        if not isinstance(subscriptions, list):
            return [], [
                DiscoveryWarning(
                    provider_id="azure",
                    message="Azure profile cache did not contain a subscriptions list.",
                    source=path,
                )
            ]

        profiles: list[DiscoveredProfile] = []
        for subscription in subscriptions:
            if not isinstance(subscription, dict):
                continue
            subscription_id = str(subscription.get("id") or "unknown")
            display_name = str(subscription.get("name") or subscription_id)
            tenant_id = str(subscription.get("tenantId") or "").strip()
            user_name = ""
            user_payload = subscription.get("user")
            if isinstance(user_payload, dict):
                user_name = str(user_payload.get("name") or "").strip()
            details = ", ".join(part for part in (tenant_id, user_name) if part)
            profiles.append(
                DiscoveredProfile(
                    provider_id="azure",
                    profile_id=subscription_id,
                    display_name=display_name,
                    source=path,
                    details=details,
                )
            )
        return profiles, []

    def _discover_gcp(
        self,
    ) -> tuple[list[DiscoveredProfile], list[DiscoveryWarning]]:
        config_dir = self._settings.gcloud_config_dir
        if not config_dir.exists():
            return [], []

        profiles: list[DiscoveredProfile] = []
        warnings: list[DiscoveryWarning] = []

        for config_path in sorted(config_dir.glob("config_*")):
            parser = configparser.RawConfigParser()
            try:
                parser.read(config_path, encoding="utf-8")
            except configparser.Error as exc:
                warnings.append(
                    DiscoveryWarning(
                        provider_id="gcp",
                        message=f"Failed to parse gcloud configuration: {exc}",
                        source=config_path,
                    )
                )
                continue

            profile_name = config_path.name.removeprefix("config_") or "default"
            account = parser.get("core", "account", fallback="").strip()
            project = parser.get("core", "project", fallback="").strip()
            display_name = project or profile_name
            details = ", ".join(part for part in (account, project) if part)
            profiles.append(
                DiscoveredProfile(
                    provider_id="gcp",
                    profile_id=profile_name,
                    display_name=display_name,
                    source=config_path,
                    details=details,
                )
            )

        return profiles, warnings

    @staticmethod
    def _format_aws_details(section_values: dict[str, str]) -> str:
        detail_fields = (
            section_values.get("region", "").strip(),
            section_values.get("sso_account_id", "").strip(),
            section_values.get("role_arn", "").strip(),
        )
        return ", ".join(field for field in detail_fields if field)


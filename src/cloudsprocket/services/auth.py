from __future__ import annotations

from pathlib import Path
from shutil import which

from cloudsprocket.config import AppSettings
from cloudsprocket.models import ProviderHealth, ProviderState


class AuthStatusService:
    def __init__(
        self,
        settings: AppSettings,
        *,
        lookup_command=which,
    ) -> None:
        self._settings = settings
        self._lookup_command = lookup_command

    def snapshot(self) -> tuple[ProviderHealth, ...]:
        return (
            self._probe_provider(
                provider_id="aws",
                label="AWS",
                cli_name="aws",
                candidate_paths=(
                    self._settings.aws_config_path,
                    self._settings.aws_credentials_path,
                ),
            ),
            self._probe_provider(
                provider_id="azure",
                label="Azure",
                cli_name="az",
                candidate_paths=(self._settings.azure_profile_path,),
            ),
            self._probe_provider(
                provider_id="gcp",
                label="GCP",
                cli_name="gcloud",
                candidate_paths=(self._settings.gcloud_config_dir,),
            ),
        )

    def _probe_provider(
        self,
        *,
        provider_id: str,
        label: str,
        cli_name: str,
        candidate_paths: tuple[Path, ...],
    ) -> ProviderHealth:
        existing_paths = tuple(path for path in candidate_paths if path.exists())
        command_path = self._lookup_command(cli_name)

        if existing_paths:
            summary = "Local credentials or profile data detected."
            state = ProviderState.CONFIGURED
        elif command_path:
            summary = f"{cli_name} is installed, but no local profile data was found."
            state = ProviderState.TOOLING_ONLY
        else:
            summary = f"No {label} CLI or local profile data was detected."
            state = ProviderState.MISSING

        return ProviderHealth(
            provider_id=provider_id,
            label=label,
            state=state,
            summary=summary,
            locations=existing_paths,
            command_path=Path(command_path) if command_path else None,
        )

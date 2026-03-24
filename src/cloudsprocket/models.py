from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum
from pathlib import Path


class ProviderState(StrEnum):
    CONFIGURED = "configured"
    TOOLING_ONLY = "tooling-only"
    MISSING = "missing"


@dataclass(frozen=True, slots=True)
class ProviderHealth:
    provider_id: str
    label: str
    state: ProviderState
    summary: str
    locations: tuple[Path, ...] = ()


@dataclass(frozen=True, slots=True)
class DiscoveredProfile:
    provider_id: str
    profile_id: str
    display_name: str
    source: Path
    details: str = ""


@dataclass(frozen=True, slots=True)
class DiscoveryWarning:
    provider_id: str
    message: str
    source: Path | None = None


@dataclass(frozen=True, slots=True)
class DiscoveryReport:
    profiles: tuple[DiscoveredProfile, ...] = ()
    warnings: tuple[DiscoveryWarning, ...] = ()


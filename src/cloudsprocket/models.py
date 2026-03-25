from __future__ import annotations

from dataclasses import dataclass, field
from enum import StrEnum
from pathlib import Path


class ProviderState(StrEnum):
    CONFIGURED = "configured"
    TOOLING_ONLY = "tooling-only"
    MISSING = "missing"


class AuthMethod(StrEnum):
    CLI = "cli"
    SSO = "sso"
    LOCAL_FILES = "local-files"


class ActionKind(StrEnum):
    REFRESH = "refresh"
    WHOAMI = "whoami"
    SSO_LOGIN = "sso-login"
    LOGOUT = "logout"
    ACTIVATE = "activate"
    OPEN_CONFIG = "open-config"
    COPY_EXPORT = "copy-export"


class CommandExecutionType(StrEnum):
    PROCESS = "process"
    INTERNAL = "internal"
    OPEN_PATH = "open-path"
    COPY_TEXT = "copy-text"


class CommandState(StrEnum):
    IDLE = "idle"
    RUNNING = "running"


class LogLevel(StrEnum):
    INFO = "info"
    SUCCESS = "success"
    WARNING = "warning"
    ERROR = "error"


@dataclass(frozen=True, slots=True)
class DetailField:
    label: str
    value: str


@dataclass(frozen=True, slots=True)
class ProviderCapability:
    capability_id: str
    label: str
    summary: str
    available: bool = True


@dataclass(frozen=True, slots=True)
class AuthMethodStatus:
    method: AuthMethod
    label: str
    summary: str
    available: bool = True


@dataclass(frozen=True, slots=True)
class ProviderHealth:
    provider_id: str
    label: str
    state: ProviderState
    summary: str
    locations: tuple[Path, ...] = ()
    command_path: Path | None = None


@dataclass(frozen=True, slots=True)
class DiscoveredProfile:
    provider_id: str
    profile_id: str
    display_name: str
    source: Path
    details: str = ""
    source_paths: tuple[Path, ...] = ()
    attributes: tuple[DetailField, ...] = ()

    def attribute_map(self) -> dict[str, str]:
        return {field.label: field.value for field in self.attributes}


@dataclass(frozen=True, slots=True)
class DiscoveryWarning:
    provider_id: str
    message: str
    source: Path | None = None


@dataclass(frozen=True, slots=True)
class DiscoveryReport:
    profiles: tuple[DiscoveredProfile, ...] = ()
    warnings: tuple[DiscoveryWarning, ...] = ()


@dataclass(frozen=True, slots=True)
class ProviderAction:
    action_id: str
    label: str
    kind: ActionKind
    auth_method: AuthMethod | None = None
    enabled: bool = True
    requires_profile: bool = False
    description: str = ""
    disabled_reason: str | None = None


@dataclass(frozen=True, slots=True)
class CommandSpec:
    action_id: str
    execution_type: CommandExecutionType
    program: str | None = None
    args: tuple[str, ...] = ()
    cwd: Path | None = None
    env: tuple[tuple[str, str], ...] = ()
    path: Path | None = None
    clipboard_text: str | None = None
    summary: str = ""

    def display_text(self) -> str:
        if self.execution_type == CommandExecutionType.PROCESS and self.program:
            return " ".join([self.program, *self.args])
        if self.execution_type == CommandExecutionType.OPEN_PATH and self.path:
            return f"Open {self.path}"
        if self.execution_type == CommandExecutionType.COPY_TEXT:
            return "Copy export snippet"
        return self.summary or self.action_id


@dataclass(frozen=True, slots=True)
class CommandResult:
    spec: CommandSpec
    exit_code: int
    stdout: str = ""
    stderr: str = ""
    summary: str = ""
    succeeded: bool = False


@dataclass(frozen=True, slots=True)
class LogEntry:
    level: LogLevel
    message: str
    details: str = ""
    action_id: str | None = None


@dataclass(frozen=True, slots=True)
class ProfileDetails:
    provider_id: str
    title: str
    subtitle: str = ""
    summary: str = ""
    detail_fields: tuple[DetailField, ...] = ()
    source_paths: tuple[Path, ...] = ()
    auth_methods: tuple[AuthMethodStatus, ...] = ()
    capabilities: tuple[ProviderCapability, ...] = ()
    notes: tuple[str, ...] = ()


@dataclass(slots=True)
class SessionState:
    current_provider_id: str | None = None
    selected_profile_id: str | None = None
    active_profile_by_provider: dict[str, str] = field(default_factory=dict)
    command_state: CommandState = CommandState.IDLE
    running_action_id: str | None = None
    recent_logs: list[LogEntry] = field(default_factory=list)

    def active_profile_id(self, provider_id: str) -> str | None:
        return self.active_profile_by_provider.get(provider_id)


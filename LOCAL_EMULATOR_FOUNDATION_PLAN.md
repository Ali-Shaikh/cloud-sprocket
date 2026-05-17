# Local Emulator Foundation Plan

## Decision

- Use an isolated local-mode model.
- Keep real-cloud and local-emulator configuration separate.
- Do not mutate the user's default AWS or Azure configuration automatically.
- Keep Docker control, health checks, and config-file mutation inside the Go sidecar.
- Treat LocalStack as AWS local mode and `floci-az` as Azure local mode.

## Delivery Backlog

1. Foundation slice on `feat/local-emulator-foundation`
   - Add runtime-mode and local-runtime model foundations.
   - Add Docker diagnostics and emulator summary models.
   - Add local-config artefact models.
   - Extend existing snapshots rather than adding new RPC methods.
   - Surface the new data in the workspace overview and mock backend.

2. Docker runtime slice
   - Add a daemon Docker control package using the Docker Engine API.
   - Detect engine endpoint, context, and platform-specific socket or named-pipe paths.
   - Add labelled resource ownership, health checks, log streaming, and restart reconciliation.

3. AWS LocalStack slice
   - Add LocalStack driver definition and lifecycle control.
   - Generate app-managed AWS local profile artefacts.
   - Reuse current `endpoint_url` and guarded write policy.
   - Add start, stop, status, and reveal-config actions.

4. Azure `floci-az` slice
   - Add `floci-az` driver definition and lifecycle control.
   - Generate app-managed Azure local connection strings and env snippets.
   - Add Azure Local workspace views for Blob, Queue, Table, Functions, and App Configuration.
   - Keep this separate from real Azure subscription, resource-group, and VM views.

5. Local config UX slice
   - Add managed-artifact creation, backup, rollback, reveal, and destroy flows.
   - Show exactly what files the app created and where they live.
   - Add conflict handling and clearer diagnostic copy.

6. Hardening slice
   - Pin image digests.
   - Add compatibility checks for Docker API, emulator image versions, and desktop app version.
   - Add stronger failure handling, stale-resource cleanup, and expanded tests.

## Branch Plan

- Current branch: `feat/local-emulator-foundation`
  - Scope: modelling and UI foundation only.
  - No container start or stop actions yet.
  - No writes to user cloud config yet.

- Planned follow-on branches:
  - `feat/docker-emulator-runtime`
  - `feat/aws-localstack-runtime`
  - `feat/azure-floci-local-runtime`
  - `feat/local-config-managed-artifacts`
  - `feat/emulator-hardening-observability`

## Current Branch Scope

### Goals

- Establish a typed foundation for runtime mode, Docker diagnostics, emulator summaries, and managed local config artefacts.
- Keep transport changes minimal by extending existing `app.settings.get` and `workspace.get` responses.
- Prepare the frontend to render the new concepts without yet adding action-heavy controls.

### Out Of Scope

- Starting or stopping containers.
- Pulling images.
- Writing AWS or Azure local config artefacts.
- Reworking the setup flow to choose runtime mode.
- Azure Local service tabs.

### File Plan

- Backend
  - `backend/daemon/internal/models/models.go`
  - `backend/daemon/internal/config/settings.go`
  - `backend/daemon/internal/app/service.go`
  - `backend/daemon/internal/app/service_test.go`

- Frontend
  - `apps/desktop/src/types/backend.ts`
  - `apps/desktop/src/App.tsx`
  - `apps/desktop/src/lib/backend.ts`
  - `apps/desktop/src/views/WorkspaceView.tsx`
  - `apps/desktop/src/App.test.tsx`

### Suggested Commit Order

1. `feat: add local runtime foundation models`
   - backend model types
   - config settings and directories
   - workspace snapshot population helpers

2. `feat: surface local runtime foundations in desktop shell`
   - TypeScript mirrors
   - empty-state and mock backend updates
   - overview panels for Docker, emulators, and local config artifacts

3. `test: cover local runtime foundation snapshots`
   - backend tests
   - frontend tests
   - checkpoint refresh after verification

## Daemon API Draft

### Foundation Slice

- Keep the RPC transport unchanged.
- Keep method registration in `backend/daemon/internal/app/service.go` unchanged.
- Extend existing methods only:
  - `app.settings.get`
  - `workspace.get`

### Response Additions

- Extend `AppSettingsSnapshot` with app-owned local runtime paths and default runtime mode.
- Extend `WorkspaceSnapshot` with structured Docker diagnostics, emulator summaries, and local-config artefacts.

### Deferred RPC Methods

These should not be implemented in the foundation slice, but the naming should stay consistent with the current dotted-method style.

- `docker.diagnostics.get`
- `emulators.list`
- `emulators.start`
- `emulators.stop`
- `emulators.logs`
- `localConfig.prepare`
- `localConfig.rollback`
- `localConfig.reveal`

## Model Draft

### Go Types

Add to `backend/daemon/internal/models/models.go`:

```go
type RuntimeMode string

const (
	RuntimeModeCloud         RuntimeMode = "cloud"
	RuntimeModeLocalEmulator RuntimeMode = "local-emulator"
)

type DockerEngineState string

const (
	DockerEngineStateUnknown     DockerEngineState = "unknown"
	DockerEngineStateUnavailable DockerEngineState = "unavailable"
	DockerEngineStateAvailable   DockerEngineState = "available"
)

type EmulatorStatus string

const (
	EmulatorStatusUnknown       EmulatorStatus = "unknown"
	EmulatorStatusNotConfigured EmulatorStatus = "not-configured"
	EmulatorStatusStopped       EmulatorStatus = "stopped"
	EmulatorStatusRunning       EmulatorStatus = "running"
	EmulatorStatusUnhealthy     EmulatorStatus = "unhealthy"
)
```

Add structured snapshot types:

```go
type DockerDiagnostics struct {
	EngineState DockerEngineState `json:"engineState"`
	Summary     string            `json:"summary"`
	ContextName string            `json:"contextName,omitempty"`
	Host        string            `json:"host,omitempty"`
	Details     []DetailField     `json:"details"`
}

type EmulatorSummary struct {
	EmulatorID string        `json:"emulatorId"`
	ProviderID string        `json:"providerId"`
	Label      string        `json:"label"`
	Kind       string        `json:"kind"`
	Status     EmulatorStatus `json:"status"`
	Summary    string        `json:"summary"`
	Details    []DetailField `json:"details"`
}

type LocalConfigArtifact struct {
	ArtifactID string    `json:"artifactId"`
	ProviderID string    `json:"providerId"`
	Label      string    `json:"label"`
	Path       string    `json:"path"`
	Status     string    `json:"status"`
	Managed    bool      `json:"managed"`
	Summary    string    `json:"summary"`
}
```

Extend existing snapshots:

```go
type AppSettingsSnapshot struct {
	PlatformName      string      `json:"platformName"`
	ConfigDir         string      `json:"configDir"`
	DatabasePath      string      `json:"databasePath"`
	LogPath           string      `json:"logPath"`
	RuntimeMode       RuntimeMode `json:"runtimeMode"`
	LocalConfigDir    string      `json:"localConfigDir"`
	EmulatorStateDir  string      `json:"emulatorStateDir"`
}

type WorkspaceSnapshot struct {
	...
	DockerDiagnostics  DockerDiagnostics     `json:"dockerDiagnostics"`
	EmulatorSummaries  []EmulatorSummary     `json:"emulatorSummaries"`
	LocalConfigArtifacts []LocalConfigArtifact `json:"localConfigArtifacts"`
}
```

### TypeScript Mirrors

Mirror the same shape in `apps/desktop/src/types/backend.ts`:

```ts
export type RuntimeMode = "cloud" | "local-emulator";
export type DockerEngineState = "unknown" | "unavailable" | "available";
export type EmulatorStatus = "unknown" | "not-configured" | "stopped" | "running" | "unhealthy";

export interface DockerDiagnostics {
  engineState: DockerEngineState;
  summary: string;
  contextName?: string;
  host?: string;
  details: DetailField[];
}

export interface EmulatorSummary {
  emulatorId: string;
  providerId: string;
  label: string;
  kind: string;
  status: EmulatorStatus;
  summary: string;
  details: DetailField[];
}

export interface LocalConfigArtifact {
  artifactId: string;
  providerId: string;
  label: string;
  path: string;
  status: string;
  managed: boolean;
  summary: string;
}
```

### Session Model Note

- Do not change `SessionSnapshot` in the foundation slice.
- Future setup-flow work will likely add:
  - `selectedRuntimeMode`
  - `lockedRuntimeMode`
  - `selectedEmulatorId`

That change should happen only when the UI actually supports runtime-mode selection.

## Settings Draft

Extend `backend/daemon/internal/config/settings.go` with app-owned paths and env overrides:

- `CLOUDSPROCKET_RUNTIME_MODE`
- `CLOUDSPROCKET_LOCAL_CONFIG_DIR`
- `CLOUDSPROCKET_EMULATOR_STATE_DIR`

Recommended new settings fields:

- `RuntimeMode`
- `LocalConfigDir`
- `EmulatorStateDir`

Use app-owned defaults under the existing config root so cleanup and backup stay deterministic.

## Service Draft

Update `backend/daemon/internal/app/service.go` to:

- extend `settingsSnapshot()` with the new settings values
- keep `EnvironmentDiagnostics` for broad environment paths and tooling
- add a new `dockerDiagnostics()` helper for structured Docker state
- add a new `emulatorSummaries()` helper for placeholder LocalStack and `floci-az` summaries
- add a new `localConfigArtifacts()` helper for app-managed artefact placeholders
- populate the new fields in `buildWorkspaceSnapshot()`

The foundation slice may return placeholder or inferred state, for example `not-configured`, until Docker control and config generation land in later slices.

## Frontend Draft

### Immediate Changes

- extend `emptySettings` and `emptyWorkspace` in `apps/desktop/src/App.tsx`
- extend the mock backend in `apps/desktop/src/lib/backend.ts`
- surface the new snapshot sections in the Overview area of `apps/desktop/src/views/WorkspaceView.tsx`

### UI Intent

- show runtime mode clearly
- show Docker availability clearly
- show LocalStack and `floci-az` as managed local runtime targets
- show local-config artefacts as app-managed paths, even before write actions exist

The first UI pass should be informational, not action-heavy.

## Verification Plan

- Backend:
  - `go -C backend/daemon test ./...`

- Frontend:
  - `pnpm --dir apps/desktop test`
  - `pnpm run typecheck:desktop`

- Optional local build after UI changes:
  - `GOFLAGS=-buildvcs=false pnpm --dir apps/desktop build:desktop:exe`

## Done Criteria For This Branch

- Existing snapshots expose runtime-mode, Docker, emulator, and local-config foundation fields.
- Frontend renders the new data without breaking existing AWS and Azure real-cloud flows.
- Mock backend and tests cover the new fields.
- No Docker orchestration or config mutation is shipped yet.

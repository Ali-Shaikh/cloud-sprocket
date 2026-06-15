# CloudSprocket read/write mode plan

Status: implementing (branch `feat/v0.6-cloud-breadth`). British English; no real-AWS writes in v0.6.

## Problem

Write access today is **profile-derived only**. The daemon enables `awsWritesEnabled` when an AWS
profile has both `cloudsprocket_allow_writes = true` and a local `endpoint_url` (localhost,
LocalStack, or private IP). There is no in-app toggle. UI copy claims "opt in per service", which
is misleading. The Overview banner is the only persistent indicator and is hidden on other tabs.

Real AWS endpoints remain blocked by the profile ceiling (intentional safety rail).

## Goals

1. **Session write mode** — explicit user intent, default off when a workspace opens.
2. **Profile capability ceiling** — daemon still decides whether a profile *can* write (local endpoint + opt-in).
3. **Visible control** — always reachable from the locked workspace top bar.
4. **Friction on enable** — AlertDialog with endpoint + consequences before turning writes on.
5. **Per-action confirms** — keep S3 acknowledgement, EC2/Lambda dialogs (unchanged).

## Non-goals (v0.6)

- Writes against public real AWS endpoints.
- Azure/GCP write mode (no write RPCs yet).
- Persisting write mode across app restarts (session-only; cleared on unlock).

## Three-layer model

| Layer | Owner | Default | Purpose |
|-------|-------|---------|---------|
| Profile capability | Daemon (`profileAllowsAWSWrites`) | Off unless config qualifies | Hard ceiling: local endpoint + `cloudsprocket_allow_writes` |
| Session write mode | User toggle (`session.awsWriteModeEnabled`) | Off on lock | Explicit intent for this workspace session |
| Action confirm | Per-panel UI | Required | Final safety net before mutating RPC |

**Effective writes:** `awsWritesEnabled = awsWriteModeEnabled && awsWriteCapable`

## Backend changes

### Models

- `SessionSnapshot.awsWriteModeEnabled` (bool, default false)
- `WorkspaceSnapshot.awsWriteCapable` (bool) — profile ceiling
- `WorkspaceSnapshot.awsWriteModeEnabled` (bool) — session toggle (mirrored for UI)
- `WorkspaceSnapshot.awsWritesEnabled` (bool) — effective gate (recomputed)

### RPC

`session.setWriteMode` with `{ "enabled": true | false }`

- Requires locked AWS workspace.
- If `enabled: true`, profile must be write-capable; otherwise reject with actionable error.
- Persists to SQLite session store.
- Returns updated `WorkspaceSnapshot` (or `SessionSnapshot` + state.changed — match existing patterns).

### Guards

Replace direct `profileAllowsAWSWrites(profile)` checks on mutating RPCs with
`effectiveAWSWritesEnabled(session, profile)`:

- `aws.s3.uploadObject`
- `aws.ec2.invokeAction`
- `aws.lambda.invoke`
- `aws.lambda.create`

Update error strings to mention write mode.

### Lifecycle

- `session.lock` — force `awsWriteModeEnabled = false`
- `session.unlock` / `clearLockState` — clear write mode
- `buildWorkspaceSnapshot` — populate the three workspace fields

## Frontend changes

### Top bar (primary control)

When session is locked and provider is AWS:

- Pill button: **Read-only** (info) or **Writes on** (warning)
- Click when read-only + capable → AlertDialog (endpoint, profile, consequences, Enable / Cancel)
- Click when read-only + not capable → AlertDialog explaining profile requirements
- Click when writes on → disable immediately (no heavy confirm)

### Overview banner (secondary)

Update copy:

- Read-only: "Write mode is off. Enable it from the top bar when you need mutating actions."
- Writes on: "Write mode is on. Mutating actions target {endpoint}."

### Connect view

Informational only: "Workspaces open read-only. Enable write mode from the top bar when needed."

### Mocks + tests

- `backend.ts`: `session.setWriteMode`, workspace fields
- `App.test.tsx`: toggle visibility, enable dialog, effective gating
- `service_test.go`: RPC guard when mode off despite capable profile

## PR / commit plan

1. `feat(daemon): add session write mode with profile capability ceiling`
2. `feat(desktop): top bar write mode toggle and updated safety copy`

Four-gate before each commit: `go test`, `typecheck:desktop`, `vitest`, `build:desktop:exe`.

## Future (deferred)

- Real AWS break-glass path (typed confirmation, time limit, audit log).
- Azure write mode when lifecycle RPCs exist.
- Per-service write scopes (e.g. allow Lambda invoke but not EC2 stop).
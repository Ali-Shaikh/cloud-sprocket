# Local Runtime Plan

## Current Decision

- LocalStack is the AWS local runtime and is usable from the global `Local Runtime` menu.
- Keep real-cloud and local-emulator configuration separate.
- Keep Docker lifecycle control and app-managed config writes inside the Go sidecar.
- Continue from current `dev` on branch `feat/azure-local-runtime`.
- Move the next implementation slice to Azure local runtime support instead of adding more optional LocalStack scope.

## LocalStack Status

- Done:
  - Docker runtime discovery and CloudSprocket-owned Docker resource listing.
  - Global `Local Runtime` menu available before workspace lock.
  - LocalStack profile preparation.
  - LocalStack start and stop through the Docker Engine API.
  - LocalStack auth token entry before start.
  - LocalStack persistence toggle using `PERSISTENCE=1` and app-owned emulator state mounted at `/var/lib/localstack`.
  - Extra environment variable support.
  - Recent LocalStack container logs in the app.
  - Action notifications, bounded start/stop recovery, and late-success reconciliation.
  - Built desktop app verification showing LocalStack running with `Start` disabled, `Stop` enabled, and logs visible.

- Remaining LocalStack work is optional hardening:
  - Secret storage for the LocalStack auth token instead of in-memory entry.
  - Cleanup, rollback, destroy, Compose editing, and reveal-config flows.
  - Image digest pinning and a compatibility policy beyond configurable `CLOUDSPROCKET_LOCALSTACK_IMAGE`.
  - Repeat valid-token start verification after any LocalStack-specific code changes.

## Azure Starting Point

- Azure cloud inventory already exists for subscriptions, resource groups, and virtual machines using the Azure CLI.
- The workspace shell is provider-aware and already exposes Azure overview, resource group, and VM views.
- The local runtime model currently exposes `floci-az` as a placeholder only.
- There is no Azure local runtime manager, Docker lifecycle, profile/config preparation, logs, or start/stop UI yet.

## Azure Next Slice

1. Define the Azure local runtime target and image/config policy.
2. Add backend models for Azure local runtime status and start options, matching the LocalStack action-result pattern where possible.
3. Add a Go sidecar Azure runtime manager for status, start, stop, logs, and app-owned local config artefacts.
4. Wire backend RPCs through the existing `emulators.*` surface without breaking LocalStack.
5. Add UI controls in `Local Runtime` for the Azure runtime, keeping controls disabled or explanatory until the manager supports them.
6. Add focused backend and desktop tests for status, start/stop wiring, logs, and Azure-specific UI rendering.
7. Run final verification:
   - `go -C backend/daemon test ./...`
   - `pnpm run typecheck:desktop`
   - `pnpm --dir apps/desktop test`
   - `pnpm run build:desktop:exe`

## Deferred

- Azure service-specific local views beyond the runtime shell.
- Destructive cleanup and rollback actions for any local runtime.
- Docker Compose editing for LocalStack or Azure local runtime.
- Persisted secret storage for emulator credentials.

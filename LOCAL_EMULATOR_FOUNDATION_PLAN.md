# Local Runtime Plan

## Current Decision

- LocalStack is the AWS local runtime and is usable from the global `Local Runtime` menu.
- Keep real-cloud and local-emulator configuration separate.
- Keep Docker lifecycle control and app-managed config writes inside the Go sidecar.
- Continue from current `dev` on branch `feat/azure-local-runtime`.
- The first Azure local runtime slice is implemented locally and should be committed after final review.

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
- The local runtime model now exposes floci-az through the same global `Local Runtime` menu as LocalStack.

## Azure Status

- Done:
  - Defined floci-az as the Azure local runtime target using `floci/floci-az:latest`.
  - Added `CLOUDSPROCKET_FLOCI_AZ_IMAGE` for image override.
  - Added a Go sidecar floci-az manager for Docker status, start, stop, logs, and app-owned env file preparation.
  - Added floci-az persistence using app-owned emulator state mounted at `/app/data`.
  - Wired `emulators.prepareProfile`, `emulators.start`, `emulators.stop`, `emulators.logs`, and `emulators.list` by emulator ID.
  - Added global and locked `Local Runtime` controls for floci-az persistence, env variables, start, stop, action state, notifications, polling, and logs.
  - Added backend and desktop tests for the floci-az runtime path.

- Verification completed:
   - `go -C backend/daemon test ./...`
   - `pnpm run typecheck:desktop`
   - `pnpm --dir apps/desktop test`
   - `pnpm run build:desktop:exe`

## Azure Next Slice

1. Commit and push the verified floci-az runtime slice.
2. Manually start and stop floci-az from the built app on a Docker-enabled machine.
3. Add Azure service-specific local views only after the runtime start/stop path is confirmed locally.
4. Decide whether the generated `azure/floci-az.env` should be surfaced with copy/reveal actions or consumed by a provider-specific command helper.

## Deferred

- Azure service-specific local views beyond the runtime shell.
- Destructive cleanup and rollback actions for any local runtime.
- Docker Compose editing for LocalStack or Azure local runtime.
- Persisted secret storage for emulator credentials.

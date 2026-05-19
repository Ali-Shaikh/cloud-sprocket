# Checkpoint

- Date: `2026-05-18`
- Branch: `feat/local-emulator-foundation`
- Head: `27f04d8`
- Working tree: local changes present
- Status: local emulator foundation and read-only Docker runtime slices committed and verified on `feat/local-emulator-foundation`

## Current State

- `CHECKPOINT.local.md` is the detailed local working log; this file stays compact as the shared resume point.
- Active branch rule: create a feature/bug branch first and do not commit directly to `dev`.
- Current branch checked out: `feat/local-emulator-foundation`.
- Latest completed release work in history is `0.1.17`.
- Latest merged feature work on `dev` is PR `#18` for Azure inventory workspace views.

## Latest Verified State

- `pnpm --dir apps/desktop test` passed.
- `tsc --noEmit` passed from `apps/desktop`.
- `go -C backend/daemon test ./...` passed.
- `GOFLAGS=-buildvcs=false pnpm --dir apps/desktop build:desktop:exe` passed locally.
- `pnpm run typecheck:desktop` passed.
- `go -C backend/daemon test ./...` passed again after the CI follow-up edits.
- `pnpm run typecheck:desktop` passed again on `2026-05-15` after resuming.
- `go -C backend/daemon test ./...` passed after updating `modernc.org/sqlite` to `v1.50.1`.
- `pnpm --dir apps/desktop test` passed after active dependency updates, including the major Vite toolchain refresh.
- `pnpm run typecheck:desktop` passed after active dependency updates, including TypeScript `6.0.3`.
- `GOFLAGS=-buildvcs=false pnpm --dir apps/desktop build:desktop:exe` passed after Tauri `2.11.x`, Vite `8.0.13`, Vitest `4.1.6`, jsdom `29.1.1`, pnpm `11.1.2`, and direct `thiserror` `2` updates.
- `CI=true pnpm install --frozen-lockfile` passed after allowing the `esbuild` install script required by `pnpm` `11.1.2`.
- `pnpm run typecheck:desktop` passed on `feat/ui-shell-ia-refresh`.
- `pnpm --dir apps/desktop test` passed on `feat/ui-shell-ia-refresh`.
- `go -C backend/daemon test ./...` passed on `feat/ui-shell-ia-refresh`.
- `GOFLAGS=-buildvcs=false pnpm --dir apps/desktop build:desktop:exe` passed on `feat/ui-shell-ia-refresh` and refreshed the Windows verification executable.
- `pnpm run typecheck:desktop` passed on `feat/azure-workspace-foundation`.
- `go -C backend/daemon test ./...` passed on `feat/azure-workspace-foundation`.
- `GOFLAGS=-buildvcs=false pnpm --dir apps/desktop build:desktop:exe` passed on `feat/azure-workspace-foundation` and refreshed the Windows verification executable.
- `pnpm --dir apps/desktop test` passed after Azure Resource Groups and Virtual Machines views were completed.
- `go -C backend/daemon test ./...` passed on `feat/local-emulator-foundation` after adding runtime-mode, Docker diagnostics, emulator summaries, and local-config artifact foundations.
- `pnpm --dir apps/desktop test` passed on `feat/local-emulator-foundation`.
- `pnpm run typecheck:desktop` passed on `feat/local-emulator-foundation`.
- `GOFLAGS=-buildvcs=false pnpm --dir apps/desktop build:desktop:exe` passed on `feat/local-emulator-foundation` and refreshed the local verification executable.
- `go -C backend/daemon test ./...` passed again on `feat/local-emulator-foundation` after adding the read-only Docker runtime subsystem.
- `pnpm --dir apps/desktop test` passed again on `feat/local-emulator-foundation` after surfacing live Docker runtime state and managed Docker resources.
- `pnpm run typecheck:desktop` passed again on `feat/local-emulator-foundation` after the Docker runtime UI updates.
- `GOFLAGS=-buildvcs=false pnpm --dir apps/desktop build:desktop:exe` passed again on `feat/local-emulator-foundation` after the Docker runtime slice.

## Open Notes

- Local release bundle build hit Windows Installer service validation limits in this sandbox at WiX `light.exe`.
- Earlier dependency PR CI failures traced back to the already-fixed Tauri RGBA icon issue, not the dependency bumps themselves.
- Remaining higher-value parity gaps versus the archived PySide app are provider actions such as AWS `Who Am I`, AWS SSO login/logout, config opening, export snippet copy, clearer discovery warnings, and fuller Azure/GCP action parity.
- PR `#18` `feat: add azure inventory workspace views` is now merged into `dev`.
- New planning track in progress:
  - Goal: let users start and manage LocalStack for AWS and `floci-az` for Azure from the app, with Docker controls and app-assisted local config creation.
  - Recommended architecture so far: keep emulator lifecycle, Docker access, health checks, and config mutation inside the Go sidecar; the Tauri frontend should send only high-level intents.
  - Recommended provider model so far: treat LocalStack as AWS local mode and `floci-az` as Azure local mode rather than inventing new top-level providers.
  - Chosen safety model: generate dedicated local-only profiles, snippets, or env files and avoid mutating the user's default real-cloud profiles.
  - Known AWS advantage: current daemon already supports profile `endpoint_url` and guarded local write actions.
  - Known Azure gap: current Azure integration depends on Azure CLI discovery and needs a new emulator-aware configuration and inventory path.
  - Known platform gap: there is no Docker orchestration layer in the app yet; this must be added as a new daemon subsystem with strict resource allow-lists and labelled ownership.
- Current branch foundation work:
  - Branch: `feat/local-emulator-foundation`
  - Drafted backlog and branch plan in `LOCAL_EMULATOR_FOUNDATION_PLAN.md`.
  - Drafted the first-slice daemon API and TypeScript model shape before coding.
  - First implementation slice stays additive by extending existing `app.settings.get` and `workspace.get` snapshots rather than adding new RPC methods.
  - Completed first implementation slice:
    - added runtime-mode, Docker diagnostics, emulator summary, and local-config artifact foundation models
    - added app-owned local runtime paths in backend settings and runtime directory preparation
    - extended workspace Overview with Docker Diagnostics, Local Emulators, and Local Config Artifacts panels
    - updated the browser mock backend and empty-state snapshots for the new contract
    - added backend and frontend test coverage for the new snapshot fields
  - Planned first-slice files:
    - `backend/daemon/internal/models/models.go`
    - `backend/daemon/internal/config/settings.go`
    - `backend/daemon/internal/app/service.go`
    - `apps/desktop/src/types/backend.ts`
    - `apps/desktop/src/App.tsx`
    - `apps/desktop/src/lib/backend.ts`
    - `apps/desktop/src/views/WorkspaceView.tsx`
- Current branch follow-on Docker runtime work:
  - Added a read-only Docker runtime subsystem in `backend/daemon/internal/dockerruntime/` using the current Moby client modules.
  - Added dedicated backend methods:
    - `docker.runtime.get`
    - `docker.resources.list`
  - `workspace.get` now includes live Docker runtime state plus CloudSprocket-managed Docker resources.
  - Overview now shows:
    - `Docker Runtime`
    - `Managed Docker Resources`
    - targeted `Refresh Docker` control
  - Current committed branch history:
    - `e414ce1` `feat: add local runtime foundation models`
    - `b96e5ad` `feat: surface local runtime foundations in desktop shell`
    - `0d0eaaf` `test: cover local runtime foundation snapshots`
    - `3492f46` `feat: add docker runtime snapshot models`
    - `bcf459d` `feat: add docker runtime backend service`
    - `9ab2727` `feat: surface docker runtime readiness in workspace overview`
    - `27f04d8` `test: cover docker runtime readiness and resources`
- Latest dependency refresh merged on `dev`:
  - Active app stack only; archived `legacy/pyside-v1/` dependency updates intentionally left out.
  - Applied low-risk active updates: Cloudscape patch updates, React `19.2.6`, Tauri JS and Rust `2.11.x`, tokio `1.52.3`, Vite `7.3.3`, and `modernc.org/sqlite` `v1.50.1`.
  - Applied major toolchain updates that verified cleanly: `@vitejs/plugin-react` `6.0.2`, `vite` `8.0.13`, `vitest` `4.1.6`, `jsdom` `29.1.1`, `typescript` `6.0.3`, and workspace `pnpm` `11.1.2`.
  - Updated direct Rust dependency `thiserror` from `1` to `2`; transitive `thiserror` `1` remains in the graph where required by upstream crates.
  - Added `pnpm-workspace.yaml` `allowBuilds.esbuild: true` so CI can install successfully with `pnpm` `11`.
- Files changed and not yet committed:
  - `CHECKPOINT.md`
  - `CHECKPOINT.local.md`
- Likely next step on resume:
  - Start the LocalStack runtime slice on top of the new Docker runtime subsystem and managed local-config foundations.

# Checkpoint

- Date: `2026-06-09`
- Branch: `feat/azure-local-runtime`
- Head: `1179f4e fix: lock emulator persistence and env controls while running`
- Working tree: clean. All work below is committed (not pushed). Commits ahead of `b27da35`: `fad8e31`, `cf73efb`, `b3b96bb`, `1179f4e`.
- Latest exe: `apps/desktop/src-tauri/target/release/cloudsprocket-desktop.exe`, rebuilt from `1179f4e`.
- Status: Resolved the "cannot unlock / no emulators" regression (Docker probes hanging, then mutex contention), restored floci-az decoupled from LocalStack, made the unlocked Local Runtime view work, added creation of AWS/Azure local-emulator profiles into the real cloud config, fixed un-closable banners, and locked emulator settings while running. See the dated sections below for detail. Quick verify: `pnpm --dir apps/desktop test` (19), `pnpm run typecheck:desktop`, `go -C backend/daemon test ./...`, `pnpm run build:desktop:exe` all pass.

## Active work stream: UI/UX Redesign (planning, 2026-06-09)

- Separate from the daemon fixes above. User dislikes the current UI/UX; agreed to rebuild it.
- **Decisions locked:** replace **AWS Cloudscape** entirely (it makes the app look like the AWS
  console it's meant to escape) → **Tailwind CSS v4.1 + shadcn/ui** (new-york, OKLCH, copy-in) +
  lucide-react + sonner. Theme **follows the OS** with a manual override. **No backend/RPC changes.**
- New design toward Slack / Docker Hub / OpenHuman DNA: far-left connection rail, contextual nav,
  topbar, card-based resources, status-first runtime, near-zero onboarding (kills the 4-step wizard).
- **Artefacts (all under `design-prototypes/`):** `index.html` (click-through prototype, light/dark),
  `REDESIGN-PLAN.md` (diagnosis + references), `IMPLEMENTATION-PLAN.md` (modular M0–M8 plan),
  `CHECKPOINT-ui-redesign.md` (resume point for this stream). Preview via the `prototype` server in
  `.claude/launch.json` (`python -m http.server 4321` → `/design-prototypes/index.html`).
- **Cloudscape footprint to remove (M8):** 6 files / 10 refs (`main.tsx` global-styles, `App.tsx`,
  `views/SessionSetupView.tsx`, `views/WorkspaceView.tsx`, `views/shared.tsx`, `vite.config.ts`
  manualChunks) + `styles.css` + `package.json` deps.
- **Progress:** **M0-M4 done + committed; M5 done + verified, uncommitted.** On branch
  `feat/ui-rebuild-tailwind`: M0+M1 (`93b5fc8`), M2 app shell (`5028c6c`), M3 Connect view
  (`fc968e7`), M4 Overview (`0cd5fa8`). **M5: the resource screens left `WorkspaceView` -
  new `src/views/workspace/` Tailwind views: StorageView (bucket cards, object browser + detail
  drawer, upload, URL inspect), ComputeView (EC2 fleet, inventory, lifecycle actions with
  AlertDialog confirm), AzureView (overview, resource groups, VMs), PlaceholderView (other tabs +
  the sensitive-values profile inspector).** tsc clean, 19/19 tests, Storage + Compute visually
  verified. WorkspaceView now only serves the virtualisation tab (M6) and "actions" tab (M7).
- **Next step:** **M6 - Local Runtime** (`RuntimeView.tsx`: emulator cards + logs + Docker status
  replacing the Cloudscape virtualisation tab). Full detail + resume notes in
  `design-prototypes/CHECKPOINT-ui-redesign.md` (RESUME HERE block). NB: work lives on
  `feat/ui-rebuild-tailwind`, not the default branch - check `git branch` before resuming.

## Latest Fix (2026-06-08): Docker-hang regression (could not unlock, no emulators)

- Symptom: after the floci/azure work, the workspace could not be unlocked and no emulators worked.
- Root cause: Docker status/snapshot/resource/log calls used `context.Background()` with no deadline. On Windows `dockerruntime.ResolveDockerHost` always returns the default named-pipe host (`npipe:////./pipe/docker_engine`) even when Docker Desktop is stopped, so the moby client dial waits for the absent pipe forever. In the original synchronous RPC daemon a single hung Docker call blocked every subsequent request, including `session.unlock` and `workspace.get`. The recovery's goroutine-per-request RPC change stopped the total freeze, but `emulators.list`/`workspace.get` still never returned because the underlying Docker call never completed.
- Evidence: driving the real built daemon over stdio showed `emulators.list` (id `r2`) never replied while `session.get`/`lock`/`unlock` did; `docker info` and the named pipe `\\.\pipe\docker_engine` confirmed Docker Desktop was not running; a moby `ContainerList` against the absent pipe returned only when given a context deadline (`context deadline exceeded` after the timeout).
- Fix in `backend/daemon/internal/app/service.go`:
  - added `dockerProbeTimeout = 3s` and `dockerLogsTimeout = 8s`.
  - bounded all Docker-touching request paths with `context.WithTimeout`: `emulatorsList`, `emulatorsPrepareProfile`, `emulatorsLogs`, `dockerRuntimeSnapshot`, `dockerResources`.
  - `buildWorkspaceSnapshot` now skips `dockerResources()` when the Docker runtime snapshot is unreachable, so a stopped engine does not pay two sequential timeouts per workspace fetch/poll.
  - added regression test `TestDockerRuntimeProbeIsBoundedWhenEngineBlocks` with a `blockingDockerRuntime` stub that proves the probe returns within its timeout instead of hanging.
- Verified: `go -C backend/daemon test ./...` passes (incl. new bounded-probe test). Real-daemon stdio drive now returns `emulators.list`, `docker.runtime.get`, and `emulators.logs` within their timeouts; `workspace.get` returns while locked (Docker reported unreachable, no hang); `session.unlock` returns immediately. Frontend unlock/lock verified in browser mock with no errors. `pnpm run build:desktop:exe` rebuilt `apps/desktop/src-tauri/target/release/cloudsprocket-desktop.exe` with the fixed sidecar.
- The goroutine-per-request RPC change (`rpc/server.go`) is kept: writes are mutex-serialised and the Tauri bridge correlates responses by id, so concurrent handling is safe and prevents one slow request (e.g. a 20s emulator start) from blocking the UI.

### Follow-up fixes after first build test (2026-06-08)

User tested the build and reported three issues; all fixed and re-verified:

1. Un-closable success banner. Several Flashbar notifications set `dismissible: true` but had no `onDismiss`, so the X did nothing (most visibly the discovery "Refresh completed" banner). Added `onDismiss` to the job/discovery notification and routed the ad-hoc error/reset notifications through a new `pushNotification` helper that always assigns an id and `onDismiss`. Verified in the browser mock: the banner now clears when dismissed.
2. floci-az was missing. The earlier recovery had decoupled floci-az by removing it from the active path; the user wants it back (decoupled from LocalStack). Restored end to end:
   - backend: `New()` builds the floci-az manager again; `emulators.list/prepareProfile/start/stop/logs` route floci-az by id (Docker probes bounded by the same timeouts); `emulators.logs` handler allows `floci-az`; restored the azure local-config artefact and the floci-az fallback summary.
   - frontend: `ensureEmulatorSummaries` now keeps a floci-az card (real or `defaultFlociAzSummary` fallback) instead of filtering it out; restored the floci-az card, logs panel, floci-az image in runtime settings, and the floci-az log fetch in `refreshVirtualisationState`.
   - tests: updated the locked-workspace assertions to expect floci-az present, expect 2 emulator summaries + 3 local-config artefacts, and restored the "starts and stops floci-az" test plus the floci-az fixture entry.
   - Verified in the browser mock: Start floci-az, Prepare Config, floci-az Logs, and the floci-az image all render in Local Runtime.
3. Docker asleep-but-running was "not handled". Per user choice, kept fast-fail (the 3s probe) plus manual retry (the existing "Refresh Docker" button), and made the timeout message actionable: when the Docker ping hits the deadline, the snapshot now says "Docker did not respond in time. The engine may be starting or asleep. Use Refresh Docker to retry." (`dockerruntime/runtime.go`).
- Verification after follow-ups: `go -C backend/daemon test ./...` passes; `pnpm run typecheck:desktop` passes; `pnpm --dir apps/desktop test` passes (18 tests); `pnpm run build:desktop:exe` rebuilt the exe.
- Committed as `fad8e31` (no Claude co-author trailer, per user preference).

### Unlock contention fix (2026-06-08, after `fad8e31`)

User reported unlock broke again after the floci restore. Root cause was a second, separate freeze: lock contention, not a hang.

- `workspace.get` held the service mutex (`defer s.mu.Unlock()`) for the entire `buildWorkspaceSnapshot`, which runs slow Docker and AWS probes. The Local Runtime tab polls `workspace.get` every 5s, and restoring floci-az added a second emulator Docker probe, pushing the locked snapshot build to roughly 9s when Docker is off. With the mutex held that long every 5s, `session.unlock` was starved waiting for the lock.
- Fix in `service.go`:
  - `workspace.get` now holds the mutex only around `currentState` (the store read/reconcile) and releases it before `buildWorkspaceSnapshot`, which only reads the already-loaded session and immutable settings.
  - `buildWorkspaceSnapshot` now skips both the managed-resource probe and the per-emulator status probe when the Docker engine is unreachable, using the static fallback `emulatorSummaries()` instead. This cuts a Docker-off workspace fetch from roughly 9s to roughly one 3s probe.
  - added regression test `TestUnlockNotBlockedBySlowWorkspaceFetch`: with a blocking Docker runtime and an in-flight `workspace.get`, `session.unlock` must still return well under the probe timeout.
- Verified against the real built daemon over stdio: with three concurrent `workspace.get` calls in flight (Docker off), `session.unlock` replied at about 2.3s while the workspace fetches did not finish until about 9.8s. Previously unlock was queued behind them.
- Verification: `go -C backend/daemon test ./...` passes; `pnpm run typecheck:desktop` passes; `pnpm --dir apps/desktop test` passes (18 tests); `pnpm run build:desktop:exe` rebuilt the exe.
- Committed as `cf73efb`.

### Unlocked Local Runtime + local profile creation (2026-06-09)

User reported the Local Runtime menu does nothing when the workspace is unlocked, and asked for a way to create AWS and Azure profiles that target the local emulators. User chose: write profiles into the real cloud config, covering AWS + Azure together.

1. Unlocked Local Runtime did nothing. The content area always rendered `SessionSetupView` when unlocked, regardless of the active tab, so clicking Local Runtime only highlighted the menu. Fix: render `WorkspaceView` when `session.isLocked || activeWorkspaceTabId === "virtualisation"`, and `WorkspaceView` now early-returns a standalone "Local Runtime" view (no locked-workspace chrome) when the session is unlocked. Verified in the browser: the unlocked Local Runtime shows Docker, LocalStack, floci-az, logs, and config artefacts; Overview still returns to setup.
2. Create local emulator profiles. `emulators.prepareProfile` now also writes a discoverable profile into the user's real config (in addition to the managed copy):
   - AWS: upserts `[profile cloudsprocket-localstack]` into `~/.aws/config` (region, output, `endpoint_url = http://localhost:4566`, `cloudsprocket_allow_writes = true`) and `[cloudsprocket-localstack]` into `~/.aws/credentials` (test/test). Existing sections are preserved.
   - Azure: upserts a `cloudsprocket-floci-az` subscription ("CloudSprocket floci-az (local)") into `~/.azure/azureProfile.json`, preserving existing subscriptions and tolerating a UTF-8 BOM.
   - Helpers `upsertINISection` and `upsertAzureSubscription` in `service.go` do non-destructive edits. Buttons renamed to "Create AWS Profile" / "Create Azure Profile". After a successful create the frontend reloads providers/profiles (without touching the workspace) so the profile appears in setup immediately.
   - Note: AWS local profiles work end to end (the adapters honour `endpoint_url`). The Azure local profile is created and lockable, but the Azure inventory adapter does not yet target floci-az, so locked Azure inventory against the local emulator is a future piece.
- Tests: added `TestPrepareProfileWritesDiscoverableLocalProfiles` (preserves existing AWS/Azure entries, handles BOM, and discovery surfaces both local profiles). `service_test.go` and `service.go` use the \ufeff string escape, never a literal BOM (Go rejects a mid-file BOM).
- Verified in the browser mock end to end: from the unlocked Local Runtime, "Create AWS Profile" and "Create Azure Profile" make `cloudsprocket-localstack` and "CloudSprocket floci-az (local)" appear in setup for their providers.
- Verification: `go -C backend/daemon test ./...` passes; `pnpm run typecheck:desktop` passes; `pnpm --dir apps/desktop test` passes (18 tests); `pnpm run build:desktop:exe` rebuilt the exe.
- Committed as `b3b96bb`.

### Lock emulator settings while running (2026-06-09)

User asked whether floci-az persistence even works and noted it is not locked once the emulator is running. Confirmed persistence does work (the manager sets `FLOCI_AZ_STORAGE_MODE=persistent`, `FLOCI_AZ_STORAGE_PATH=/app/data`, and a bind mount from `EmulatorStateDir/floci-az` to `/app/data`; LocalStack persistence is equivalent), but it only takes effect when the container is created or recreated on start, which requires the container to be stopped. Changing persistence/env/auth-token on a running container did nothing yet the controls stayed editable.
- Fix (`WorkspaceView.tsx`): per emulator card, `settingsLocked = status === "running" || status === "unhealthy"`. When locked, the auth token, persistence checkbox, and environment textarea are disabled and a hint says to stop the emulator to change them. Applies to both LocalStack and floci-az, per emulator.
- Added test `locks persistence and environment controls while emulators are running` (19 desktop tests total).
- Verified in the browser mock: after Start LocalStack, its auth token + persistence are disabled with the hint, while floci-az controls stay enabled (it is not running).
- Verification: `pnpm run typecheck:desktop` passes; `pnpm --dir apps/desktop test` passes (19 tests); `go -C backend/daemon test ./...` passes; `pnpm run build:desktop:exe` rebuilt the exe.

## Current State

- Branch is `feat/azure-local-runtime`, created from current `dev`.
- PR `#23` for `feat/local-emulator-foundation` was merged into `dev` by fast-forward.
- Local `dev` was pulled before creating this branch and was already up to date with `origin/dev`.
- Existing branch work already had runtime foundation models, Docker runtime discovery, managed Docker resources, LocalStack status, and LocalStack managed profile preparation.
- This resume added the next narrow runtime slice:
  - backend `emulators.start`
  - backend `emulators.stop`
  - LocalStack Docker container create, image pull, start, stop, and health check support
  - frontend Overview controls for `Prepare Profile`, `Start`, and `Stop`
  - browser mock backend support for LocalStack start and stop
  - backend and frontend tests for the new flow
- Commit author correction completed:
  - rewrote the branch commits while preserving the original branch base at `776ede5`
  - corrected the two `ali@example.com` commits to `Ali Shaikh <me@alishaikh.net>`
  - verified `origin/dev..HEAD` has no `ali@example.com` author or committer emails
  - branch now diverges from `origin/feat/local-emulator-foundation` and will need a force-with-lease push when ready
- Replaced the previous top `wip` commit with `feat: add LocalStack runtime controls`, authored and committed by `Ali Shaikh <me@alishaikh.net>`.
- After testing the local executable, locking the workspace could show a blank page if the frontend received sparse Docker/runtime fields. Added workspace snapshot normalisation in `App.tsx` and a regression test for the locked workspace view.
- After a follow-up report that the app blanked immediately on launch, extended the frontend normalisers to handle `null` arrays from Go JSON payloads for session, provider, profile, and workspace state.
- Reproduced the blank screen in the actual built app with WebView2 remote debugging. Fixed the production-only failures:
  - Tauri event names cannot contain `.`, so frontend event subscriptions and Rust event emission now bridge backend names like `state.changed` to Tauri names like `state:changed`.
  - Nested resource arrays such as EC2 security groups/tags and Azure tags are normalised before `WorkspaceView` renders.
- Resumed implementation on 2026-05-28:
  - checked current LocalStack Docker image, auth token, and persistence documentation
  - kept the LocalStack default on the current `localstack/localstack:stable` release line
  - added `CLOUDSPROCKET_LOCALSTACK_IMAGE` for pinned tags or registry mirrors
  - added a desktop LocalStack auth token field; the token is passed to Docker only when starting LocalStack
  - added a persistence toggle that sets `PERSISTENCE=1` and mounts app-owned state at `/var/lib/localstack`
  - added a validated extra environment variable textarea for LocalStack start settings such as `DEBUG=1`
  - surfaced the configured image in runtime settings and emulator summaries
  - replaced the stale foundation-only plan with the current runtime plan
- When the managed container exited with code `55`, Docker logs showed LocalStack license activation failed because no `LOCALSTACK_AUTH_TOKEN` was provided. The UI now collects the token before start, and the daemon recreates stopped managed containers when token or persistence settings need to be applied.
- Moved Docker runtime, LocalStack controls, managed Docker resources, local config artefacts, and runtime settings from Overview into a dedicated `Virtualisation` workspace menu.
- Made `Virtualisation` available before locking/selecting a cloud profile so Docker and LocalStack can be started first.
- Added Virtualisation polling while the menu is open and short polling after LocalStack start/stop so transient startup health errors such as EOF refresh once LocalStack is actually ready.
- Fixed the setup sidebar so `Lock` remains clickable when Virtualisation has been selected before locking a workspace.
- Renamed the visible runtime area to `Local Runtime` while keeping the internal `virtualisation` tab id stable.
- Added `emulators.logs` and Docker-backed LocalStack container log retrieval.
- Added LocalStack log panels to the global and locked Local Runtime views.
- Added LocalStack action status copy and failure notifications in the Local Runtime UI.
- LocalStack post-start/post-stop health polling now runs in the background after the first refresh so the Start/Stop controls do not stay blocked for the full polling window.
- Added structured emulator action results for LocalStack start, stop, and profile preparation.
- Bounded LocalStack start/stop actions so Docker hangs recover in the app with an actionable toast and re-enabled controls.
- Start is no longer disabled solely because Docker is reported unavailable; clicking it now produces a visible failure if Docker cannot complete the request.
- Added late-success reconciliation so a Docker start that completes after the frontend timeout updates LocalStack back to success on the next poll.
- Prepared release `0.1.19` so the feature branch can be pushed and tagged after verification.
- Created PR `#23` from `feat/local-emulator-foundation` into `dev`: `https://github.com/Ali-Shaikh/cloud-sprocket/pull/23`.
- Rebased `feat/local-emulator-foundation` onto `origin/dev` to resolve PR conflicts and make a fast-forward merge possible.
- Fast-forwarded `dev` to PR `#23` at `d62b91d`.
- Created continuation branch `feat/azure-local-runtime` from current `dev` on 2026-06-06.
- Updated the local runtime plan to treat LocalStack as usable and move the next implementation slice to Azure local runtime support.
- Implemented the Azure local runtime slice on 2026-06-06:
  - added `CLOUDSPROCKET_FLOCI_AZ_IMAGE`, defaulting to `floci/floci-az:latest`
  - added a Docker-backed floci-az manager for status, start, stop, logs, and managed env file preparation
  - binds floci-az to `127.0.0.1:4577`, AMQP ports `5672` and `5673`, and Kafka port `9093`
  - added persistence support using `FLOCI_AZ_STORAGE_MODE=persistent`, `FLOCI_AZ_STORAGE_PATH=/app/data`, and app-owned emulator state mounted at `/app/data`
  - writes managed Azure local env values to `azure/floci-az.env`
  - routed `emulators.prepareProfile`, `emulators.start`, `emulators.stop`, `emulators.logs`, and `emulators.list` by emulator ID
  - added floci-az controls, persistence, env variables, action notifications, polling, and logs to global and locked `Local Runtime` views
  - updated the mock backend and focused desktop tests for the floci-az start/stop flow
- Fixed a follow-up Local Runtime navigation regression on 2026-06-06:
  - locked workspaces now always show the global `Local Runtime` menu item even if `workspaceTabs` omits the synthetic `virtualisation` tab
  - the active runtime tab is no longer forced back to the first provider tab while locked
  - unlocking resets the active workspace tab to `overview`, returning the user to session setup
  - added regression coverage for unlocking from `Local Runtime` and for runtime access when backend runtime tab data is sparse

## Files Changed In This Resume

- `backend/daemon/internal/flociaz/manager.go`
- `backend/daemon/internal/flociaz/manager_test.go`
- `backend/daemon/internal/config/settings.go`
- `backend/daemon/internal/config/settings_test.go`
- `backend/daemon/internal/models/models.go`
- `backend/daemon/internal/app/service.go`
- `apps/desktop/src/App.tsx`
- `apps/desktop/src/views/WorkspaceView.tsx`
- `apps/desktop/src/views/shared.tsx`
- `apps/desktop/src/lib/backend.ts`
- `apps/desktop/src/types/backend.ts`
- `apps/desktop/src/App.test.tsx`
- `LOCAL_EMULATOR_FOUNDATION_PLAN.md`
- `CHECKPOINT.md`

## Verification On 2026-05-28

- `go -C backend/daemon test ./...` passed.
- `pnpm run typecheck:desktop` passed.
- `pnpm --dir apps/desktop test` passed, 14 tests. One parallel run timed out under load, then the same suite passed when rerun normally.
- `pnpm run build:desktop:exe` passed and rebuilt `apps/desktop/src-tauri/target/release/cloudsprocket-desktop.exe`.
- After adding token, persistence, and extra env controls:
  - `go -C backend/daemon test ./...` passed.
  - `pnpm --dir apps/desktop test` passed, 14 tests.
  - `pnpm run typecheck:desktop` passed.
  - `pnpm run build:desktop:exe` passed.
- After moving runtime controls to the `Virtualisation` menu:
  - `go -C backend/daemon test ./...` passed.
  - `pnpm --dir apps/desktop test` passed, 14 tests.
  - `pnpm run typecheck:desktop` passed.
  - `pnpm run build:desktop:exe` passed.
- After making Virtualisation global and adding status polling:
  - `pnpm run typecheck:desktop` passed.
  - `pnpm --dir apps/desktop test` passed, 14 tests.
  - `go -C backend/daemon test ./...` passed.
  - `pnpm run build:desktop:exe` passed after stopping the running desktop process that locked the executable.
- After fixing the setup sidebar `Lock` item:
  - `pnpm run typecheck:desktop` passed.
  - `pnpm --dir apps/desktop test` passed, 14 tests.
  - `pnpm run build:desktop:exe` passed after stopping the running desktop process that locked the executable.
- After renaming the visible area to `Local Runtime` and adding LocalStack logs:
  - `go -C backend/daemon test ./...` passed.
  - `pnpm run typecheck:desktop` passed.
  - `pnpm --dir apps/desktop test` passed, 14 tests.
  - `pnpm run build:desktop:exe` passed after stopping the running desktop process that locked the executable.
  - Relaunched `apps/desktop/src-tauri/target/release/cloudsprocket-desktop.exe` with WebView debugging and verified the app renders with the `Local Runtime` setup sidebar entry visible.
- After adding LocalStack action status and background polling:
  - `pnpm run typecheck:desktop` passed.
  - `pnpm --dir apps/desktop test` passed, 14 tests.
  - `pnpm run build:desktop:exe` passed.
- After adding structured action results and timeout recovery:
  - `go -C backend/daemon test ./...` passed.
  - `pnpm run typecheck:desktop` passed.
  - `pnpm --dir apps/desktop test` passed, 14 tests.
  - `pnpm run build:desktop:exe` passed.
  - Relaunched `apps/desktop/src-tauri/target/release/cloudsprocket-desktop.exe` with WebView debugging, clicked `Start`, and verified the app shows a failure toast plus action text and re-enables controls after Docker fails to complete the request.
- After Docker eventually completed the LocalStack start:
  - Docker reported `cloudsprocket-localstack` as `Up ... (healthy)` on `127.0.0.1:4566`.
  - Relaunched `apps/desktop/src-tauri/target/release/cloudsprocket-desktop.exe` with WebView debugging and verified the Local Runtime view shows LocalStack `running`, `Start` disabled, `Stop` enabled, and recent container logs.
- Release `0.1.19` verification:
  - `go -C backend/daemon test ./...` passed.
  - `pnpm run typecheck:desktop` passed.
  - `pnpm --dir apps/desktop test` passed, 14 tests.
  - `pnpm run build:desktop:exe` passed and compiled `cloudsprocket-desktop v0.1.19`.
- After rebasing onto `origin/dev` for PR `#23`:
  - `go -C backend/daemon test ./...` passed.
  - `pnpm run typecheck:desktop` passed.
  - `pnpm --dir apps/desktop test` passed, 14 tests.
  - `pnpm run build:desktop:exe` passed and compiled `cloudsprocket-desktop v0.1.19`.
- Azure local runtime slice verification on 2026-06-06:
  - `pnpm --dir apps/desktop test -- --run -t "starts and stops floci-az"` passed.
  - `pnpm --dir apps/desktop test` passed, 15 tests.
  - `pnpm run typecheck:desktop` passed.
  - `go -C backend/daemon test ./...` passed.
  - `pnpm run build:desktop:exe` passed and compiled `cloudsprocket-desktop v0.1.19`.
- Local Runtime unlock/menu regression verification on 2026-06-06:
  - `pnpm --dir apps/desktop test -- --run -t "unlocks from the local runtime workspace"` passed.
  - `pnpm --dir apps/desktop test -- --run -t "local runtime|starts and stops|unlock"` passed, 4 focused tests.
  - `pnpm --dir apps/desktop test` passed, 16 tests.
  - `pnpm run typecheck:desktop` passed.
  - `pnpm run build:desktop:exe` passed after stopping stale sidecar process `cloudsprocketd` that was locking the previous executable.

## Earlier Verification On 2026-05-27

- `pnpm --dir apps/desktop test` passed, 14 tests.
- `pnpm run typecheck:desktop` passed.
- `pnpm run build:desktop:exe` passed and rebuilt `apps/desktop/src-tauri/target/release/cloudsprocket-desktop.exe`.
- Re-ran `pnpm run build:desktop:exe` after commit `255a463`; it passed and rebuilt the same executable.
- Re-ran `pnpm --dir apps/desktop test`, `pnpm run typecheck:desktop`, and `pnpm run build:desktop:exe` after the startup null-array fix; all passed.
- Reproduced the blank screen in the built executable on 2026-05-28. The WebView reported:
  - invalid Tauri event name for `listen`
  - `TypeError: Cannot read properties of null (reading 'length')` inside `WorkspaceView`
- After the event bridge and nested array fixes:
  - `pnpm --dir apps/desktop test` passed, 14 tests.
  - `pnpm run typecheck:desktop` passed.
  - `pnpm run build:desktop:exe` passed.
  - Relaunched `apps/desktop/src-tauri/target/release/cloudsprocket-desktop.exe` and verified via WebView2 debugging that the React root renders locked workspace content.

## Earlier Verification On 2026-05-26

- `go -C backend/daemon test ./...` passed.
- `pnpm --dir apps/desktop test` passed, 12 tests.
- `pnpm run typecheck:desktop` passed.
- `pnpm run build:desktop:exe` passed and produced `apps/desktop/src-tauri/target/release/cloudsprocket-desktop.exe`.
- Browser verification passed against local Vite:
  - workspace locked successfully
  - LocalStack card rendered `Prepare Profile`, `Start`, and disabled `Stop`
  - clicking `Start` changed LocalStack to running and enabled `Stop`
  - clicking `Stop` returned LocalStack to stopped and disabled `Stop`
- Re-ran the same automated checks after tightening button gating for `unhealthy` LocalStack containers.

## Notes

- Current user direction:
  - Do not commit unless the user explicitly says to commit.
  - Ask before making architecture decisions or deferring scope.
  - Keep implementation modular, decoupled, and testable.
  - Build a local executable for verification after each major piece of work.
  - Azure service-specific local views should be discussed with the user before being deferred or started.
- Windows UI automation status:
  - Computer Use failed on 2026-06-06 before listing apps with `windows sandbox failed: spawn setup refresh`.
  - Retrying after `js_reset` produced the same failure.
  - Stopping the stale `node_repl.exe` process closed the Node REPL MCP transport, so Windows UI automation is unavailable in this thread until the Codex tool host is restarted.
  - The rebuilt CloudSprocket executable was launched directly from `apps/desktop/src-tauri/target/release/cloudsprocket-desktop.exe`; process check showed both `cloudsprocket-desktop.exe` and `cloudsprocketd.exe` running.
  - On the follow-up attempt, Computer Use remained unavailable because the Node REPL MCP transport was closed.
  - The latest local exe launch request was rejected by the approval system due usage limits, so no workaround was attempted.
- Current uncommitted bug fix:
  - Added fallback LocalStack and floci-az runtime cards in frontend workspace normalisation so Start controls remain visible even when backend emulator summaries are empty or delayed.
  - Added a locked-session `Unlock Workspace` sidebar action so unlock is always visible, not only in the workspace header.
  - Verification passed: `pnpm --dir apps/desktop test -- --run -t "local runtime|unlock"`, `pnpm run typecheck:desktop`, `pnpm --dir apps/desktop test`, and `pnpm run build:desktop:exe`.
  - Fresh executable built at `apps/desktop/src-tauri/target/release/cloudsprocket-desktop.exe`.
- Evidence-based blank-screen fix on 2026-06-06:
  - Root cause was a WIP frontend contract regression in `App.tsx`: `SessionSetupView` was called with missing required props, profiles were no longer loaded, backend state events were read with the wrong payload shape, and workspace snapshot normalisation had been removed.
  - Restored profile loading, setup view props, provider/profile state updates, workspace normalisation, S3 prefix race protection, EC2 workspace-result handling, EC2 job-result updates, and Azure tab routing.
  - Added an app error boundary that records React render errors in the debug log and shows an in-app error panel instead of a blank screen.
  - Removed duplicate sidebar labels that made tests and the UI ambiguous.
  - Kept emulator Start enabled for `unhealthy` states so Docker sleep/wake or transient health EOF does not grey out Start.
  - Added regression coverage for unhealthy emulator Start buttons.
  - Verification passed: `pnpm --dir apps/desktop test` passed, 17 tests; `pnpm run typecheck:desktop` passed; `pnpm run build:desktop:exe` passed.
  - A rebuild initially failed because the earlier launched executable was still running and Windows denied access; stopped the launched app and sidecar, then reran `pnpm run build:desktop:exe` successfully.
  - Final built executable launched successfully from `D:\Dev\cloud-sprocket\apps\desktop\src-tauri\target\release\cloudsprocket-desktop.exe`; process check showed `cloudsprocket-desktop.exe` PID `79752` and `cloudsprocketd.exe` PID `12716` running.
  - No commit was created, per user direction.
- Follow-up unlock and AWS icon fix on 2026-06-06:
  - Restored AWS service sidebar icon rendering for S3 and EC2 by routing workspace tabs back to their SVG assets and rendering `iconUrl` before provider fallback.
  - Fixed `session.unlock` so the daemon discovers the current provider/profile snapshot and emits a reconciled `state.changed` payload instead of an empty discovery snapshot.
  - Added frontend regression coverage that locked S3 and EC2 sidebar items render custom image glyphs, preventing fallback to generic Cloudscape icons.
  - Verification passed: `pnpm --dir apps/desktop test` passed, 17 tests; `pnpm run typecheck:desktop` passed; `go test ./...` passed from `backend/daemon`; `pnpm run build:desktop:exe` passed.
  - Rebuilt executable launched successfully from `D:\Dev\cloud-sprocket\apps\desktop\src-tauri\target\release\cloudsprocket-desktop.exe`; process check showed `cloudsprocket-desktop.exe` PID `63140` and `cloudsprocketd.exe` PID `60672` running.
  - Computer Use was retried after `js_reset` but still failed before listing Windows apps with `windows sandbox failed: spawn setup refresh`, so visual UI attachment was not possible in this thread.
  - No commit was created, per user direction.
- App reset feature on 2026-06-06:
  - Added backend `app.reset` with required `RESET` confirmation.
  - Reset clears CloudSprocket-owned SQLite state: session, app settings, resource cache, and activity logs.
  - Reset removes and recreates only guarded app-managed local folders: `local-config` and `emulators` when they are under the CloudSprocket config root.
  - External cloud config files such as AWS, Azure, and GCP provider config paths are not touched. Guard tests cover an external AWS config path skip.
  - Added a sidebar `Reset` action and confirmation modal. The modal copy states that AWS, Azure, and GCP config files outside CloudSprocket app data are not touched.
  - Reset also clears transient frontend state such as debug logs, LocalStack/floci-az inputs, S3/EC2 statuses, and returns the UI to setup.
  - Verification passed: `go test ./...` from `backend/daemon`; `pnpm --dir apps/desktop test` passed, 18 tests; `pnpm run typecheck:desktop` passed; `pnpm run build:desktop:exe` passed.
  - Rebuilt executable launched successfully from `D:\Dev\cloud-sprocket\apps\desktop\src-tauri\target\release\cloudsprocket-desktop.exe`; process check showed `cloudsprocket-desktop.exe` PID `85812` and `cloudsprocketd.exe` PID `78028` running.
  - No commit was created, per user direction.
- Stuck reset fix on 2026-06-06:
  - User reported reset was stuck in the built app.
  - Evidence showed the old app and sidecar were still running and app-owned LocalStack files remained present.
  - Fixed the reset path so `app.reset` returns immediately after clearing SQLite app state and saving an empty session.
  - Moved app-owned `local-config` and `emulators` directory cleanup to a background task so locked emulator files or large LocalStack cache trees cannot block the UI.
  - Removed provider discovery from the reset RPC response path. The frontend now reloads discovery in the background after reset instead of keeping the modal button in a loading state.
  - Verification passed: `pnpm --dir apps/desktop test` passed, 18 tests; `pnpm run typecheck:desktop` passed; `go test ./...` from `backend/daemon` passed; `pnpm run build:desktop:exe` passed.
  - Stopped the old running desktop and sidecar, rebuilt, and launched the corrected executable. Process check showed `cloudsprocket-desktop.exe` PID `85108` and `cloudsprocketd.exe` PID `3572` running.
  - No commit was created, per user direction.
- LocalStack-only recovery on 2026-06-06:
  - User reported the app was not working after the floci integration and requested returning to a working condition with the runtimes decoupled.
  - Restored the active Local Runtime path to LocalStack-only behaviour.
  - Removed forced floci card injection from frontend workspace normalisation.
  - Removed floci log fetch from Local Runtime refresh so opening Local Runtime only asks for `workspace.get` and LocalStack logs.
  - Removed visible floci controls and floci logs from `WorkspaceView`.
  - Stopped the default daemon service from constructing the floci manager.
  - Stopped backend `emulators.list` from probing floci and removed floci from fallback emulator summaries and app-managed local config artefacts.
  - Backend `emulators.*` now treats floci as not attached to the Local Runtime menu, so floci cannot affect LocalStack start/stop/status/reset from that surface.
  - Updated tests back to LocalStack-only runtime expectations.
  - Verification passed: `pnpm --dir apps/desktop test` passed, 17 tests; `pnpm run typecheck:desktop` passed; `go test ./...` from `backend/daemon` passed; `pnpm run build:desktop:exe` passed.
  - The rebuilt exe is at `D:\Dev\cloud-sprocket\apps\desktop\src-tauri\target\release\cloudsprocket-desktop.exe`.
  - Launching the rebuilt exe was blocked by the approval system usage limit, so the user needs to start it manually for visual testing.
  - No commit was created, per user direction.
- The first type-check failure from the previous checkpoint cleared after dependencies were materialised by the desktop test run. No TypeScript config change was required.
- Go tests needed elevated execution because the sandbox could not access the local Go build cache.
- The latest blank-screen fix touches the Tauri Rust bridge and frontend normalisation. The desktop build covered the Rust bridge compile path; Go daemon tests were not rerun because daemon code was not changed.
- LocalStack image now defaults to `localstack/localstack:stable`. Current LocalStack images require an auth token; the desktop app passes the entered token as `LOCALSTACK_AUTH_TOKEN` during container creation. Set `CLOUDSPROCKET_LOCALSTACK_IMAGE` to use a pinned tag or internal registry mirror.
- LocalStack health currently probes `http://localhost:4566/_localstack/health` with a short timeout.
- Start binds LocalStack to `127.0.0.1:4566` and only manages containers with the CloudSprocket ownership labels.
- The UI allows `Stop` for both `running` and `unhealthy` LocalStack states because both imply a managed container is present.
- floci-az status currently uses a TCP probe against `127.0.0.1:4577`.
- floci-az docs were checked on 2026-06-06 before implementation. Current defaults are image `floci/floci-az:latest`, REST port `4577`, Event Hubs AMQP `5672`, Service Bus AMQP `5673`, Kafka `9093`, and persistence path `/app/data`.

## Left To Do

1. User to launch the rebuilt exe (`1179f4e`) and confirm in the real app: unlock returns to setup with Docker off; the unlocked Local Runtime view works; Create AWS/Azure Profile makes the profiles selectable and lockable; the discovery success banner is dismissible; persistence/env/auth controls lock once an emulator is running.
2. Azure inventory against floci-az: the Azure adapter does not yet target the floci-az endpoint (`http://localhost:4577`), so a locked `cloudsprocket-floci-az` session will not list real resource groups/VMs. Implement floci-az-backed Azure inventory as the next slice (decoupled), if the user wants it.
3. Decide whether to push `feat/azure-local-runtime` and/or open a PR into `dev`.
4. Optional polish: reduce Local Runtime poll churn when Docker is off (currently each poll still issues a ~3s Docker probe); consider caching reachability briefly.

## Resume Point

- Continue on `feat/azure-local-runtime`. Working tree is clean at `1179f4e`; nothing is pushed. Commit when the user asks (no Claude co-author trailer, per memory). Next likely task: floci-az-backed Azure inventory (Left To Do #2) or push/PR (#3). Ask the user to test the latest exe first.

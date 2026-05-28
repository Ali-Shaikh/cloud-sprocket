# Local Emulator Runtime Plan

## Current Decision

- Keep real-cloud and local-emulator configuration separate.
- Keep Docker lifecycle control and app-managed config writes inside the Go sidecar.
- Treat LocalStack as the AWS local runtime target on this branch.
- Keep Azure `floci-az` as a planned placeholder only.
- Use `localstack/localstack:stable` by default. Current LocalStack images require `LOCALSTACK_AUTH_TOKEN`; the desktop app collects the token before start and passes it only to Docker.
- Allow `CLOUDSPROCKET_LOCALSTACK_IMAGE` so developers can use a pinned tag or internal registry mirror.

## Current Branch

- Branch: `feat/local-emulator-foundation`
- Actual scope now includes the foundation, Docker runtime discovery, managed LocalStack profile preparation, and LocalStack start/stop lifecycle controls.
- The branch history was rewritten to fix author metadata and will need a force-with-lease push when ready.

## Done

- Runtime settings include app-owned local config and emulator state directories.
- Workspace snapshots include Docker diagnostics, Docker runtime details, managed Docker resources, emulator summaries, and local config artefacts.
- The desktop overview renders Docker runtime, LocalStack, managed Docker resources, and local config artefacts.
- Docker runtime, LocalStack, managed Docker resources, local config artefacts, and runtime settings now live under a dedicated global `Local Runtime` menu that is available before workspace lock.
- The Local Runtime menu refreshes status while open and polls after LocalStack start/stop so startup health transitions are reflected.
- LocalStack managed AWS profile generation writes app-owned config and credentials under the CloudSprocket local config root.
- LocalStack start/stop uses Docker Engine API control through the sidecar.
- LocalStack logs are available from the app via an `emulators.logs` RPC backed by Docker container logs.
- LocalStack containers are labelled with CloudSprocket ownership labels and bind to `127.0.0.1:4566`.
- LocalStack start supports auth token, persistence, and extra environment variables from the desktop app.
- Persistence sets `PERSISTENCE=1` and mounts the app-owned emulator state directory into `/var/lib/localstack`.
- The desktop app has been verified against the built executable after fixing production WebView blank-screen crashes.

## Left To Do Before PR

1. Verify LocalStack start with a valid auth token from the global `Local Runtime` menu against Docker on a machine with a valid token.
2. Re-run the final automated checks if additional code changes are made:
   - `go -C backend/daemon test ./...`
   - `pnpm --dir apps/desktop test`
   - `pnpm run typecheck:desktop`
   - `pnpm run build:desktop:exe`
3. Decide whether this branch should push as-is or squash the three blank-screen fix commits into the runtime-control commit before opening a PR.
4. Push with `--force-with-lease` because the branch history was rewritten.

## Deferred

- Azure `floci-az` lifecycle control and local Azure service views.
- LocalStack cleanup, rollback, destroy, Compose editing, and reveal-config flows.
- Secret storage for the LocalStack auth token. The current implementation keeps the token in memory only.
- Digest pinning and compatibility policy beyond the configurable image reference.
- Expanded user-facing status copy for every Docker pull/create/start/stop failure path.

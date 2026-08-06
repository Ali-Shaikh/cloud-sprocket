# Changelog

All notable changes to CloudSprocket are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
Installers for every release are published on the
[GitHub Releases](https://github.com/Ali-Shaikh/cloud-sprocket/releases) page.

## [Unreleased]

### Changed

- Desktop GCP inventory tabs share empty-state copy helpers, and Cloud Storage
  Upload is disabled (with a write-mode title) when write mode is off.

### Tests

- Vitest smoke coverage for GCP desktop surfaces: Storage upload/delete/signed
  link and empty state, Compute start/stop with write-mode gating and empty
  state, Functions invoke gating and empty state, GKE empty state, and
  workspace-snapshot normalisation of all GCP inventory fields (including
  storage objects `isFolder` and pagination flags).

## [0.9.13] - 2026-08-06

### Added

- AWS SQS purge queue: write-gated `aws.sqs.purgeQueue` clears all messages via
  `PurgeQueue`, rebuilds the SQS workspace snapshot so depth attributes refresh,
  and adds a Purge queue control with confirmation on the selected queue.
- AWS ECS scale service: write-gated `aws.ecs.updateDesiredCount` sets the
  service desired task count via `UpdateService`, invalidates service/task
  inventory caches, and adds a Scale service control with desired-count input on
  the selected service in the ECS inspector.
- GCP GKE node pools: `gcp.gke.selectCluster` selects a cluster, enrichment loads
  node pools via `gcloud container node-pools list` for the selected cluster, and
  the desktop GKE tab shows cluster selection plus a node pools table.
- AWS SNS create subscription: write-gated `aws.sns.createSubscription` calls
  SNS `Subscribe` with protocol and endpoint for the selected topic, refreshes
  SNS inventory, and adds a Create subscription control on the SNS topic
  inspector (alongside publish and create topic).
- Azure Cosmos DB delete item: write-gated `azure.cosmos.deleteItem` deletes a
  document by id and partition key via the Cosmos data-plane REST API, refreshes
  the cosmos scope, and adds a Delete control on sampled items in the Cosmos
  workspace panel (with confirmation).
- AWS DynamoDB sample scan pagination: table describe returns the first scan page
  with `sampleItemsNextToken` / `sampleItemsHasMore`, and read-only
  `aws.dynamodb.loadMoreItems` loads the next page. The DynamoDB inspector adds a
  Load more items control that appends results client-side.
- AWS RDS reboot: write-gated `aws.rds.rebootInstance` queues an async
  `RebootDBInstance` job (same local-endpoint write mode rules as start/stop) and
  adds a Reboot instance control on the RDS fleet panel.
- GCP operator actions (gcloud CLI only):
  - Cloud Storage signed read URLs via `gcloud storage sign-url`
    (`gcp.storage.signUrl`, no write mode required). Desktop Storage browser
    offers "Signed link (1h)" for a selected object with copy support.
  - Cloud Functions invoke via `gcloud functions call`
    (`gcp.functions.call`), gated by per-session `gcpWriteModeEnabled`, with
    `gcp.functions.selectFunction` for selection. Desktop Functions tab shows
    write-mode status, selection, payload editor, and invoke response.
  - Action capability for `functions.invoke` under GCP workspaces (alongside
    existing storage/compute write capabilities from the write-mode foundation).
- AWS ECS force new deployment: write-gated `aws.ecs.forceNewDeployment` calls
  `UpdateService` with `ForceNewDeployment`, invalidates service/task inventory
  caches, and adds a Force new deployment control on the selected service in the
  ECS inspector.
- Azure Storage Queues purge: write-gated `azure.queues.purge` clears all
  messages via `ClearMessages`, refreshes the queues scope, and adds a Purge
  queue action with confirmation on the Queues panel.
- GCP Cloud Functions foundation: `gcpadapter` lists 1st and 2nd gen functions
  via `gcloud functions list` (with `--gen2`), `WorkspaceSnapshot` carries
  `gcpFunctions` / status, catalogue promotes `gcp-functions` to a live service
  (`inventoryScope: gcf`), hidden-resource probes when disabled, and the
  desktop Cloud Functions tab shows the inventory. Invoke remains deferred.
- GCP GKE foundation: `gcpadapter` lists clusters via
  `gcloud container clusters list`, `WorkspaceSnapshot` carries
  `gcpGkeClusters` / status, catalogue promotes `gcp-gke` to a live service
  (`inventoryScope: gke`), hidden-resource probes when disabled, and the
  desktop GKE tab shows the inventory. Node pool actions remain deferred.
- GCP write mutations (gcloud CLI only), gated by per-session `gcpWriteModeEnabled`
  mirroring AWS/Azure write mode:
  - Cloud Storage upload/delete via `gcloud storage cp` / `gcloud storage rm`
    (`gcp.storage.uploadObject`, `gcp.storage.deleteObject`)
  - Compute Engine start/stop via `gcloud compute instances start|stop`
    (`gcp.compute.startInstance`, `gcp.compute.stopInstance`)
  - Desktop Storage upload/delete controls and Compute Start/Stop buttons
  - Action capabilities for `storage` and `compute` under GCP workspaces
- GCP Cloud Storage object browser (read-only): `gcpadapter.ListObjects` via
  `gcloud storage ls --json`, session fields for selected bucket and prefix,
  RPCs `gcp.storage.selectBucket` / `setPrefixFilter` / `loadMoreObjects`,
  enrichment of the first object page when a bucket is selected, and the
  desktop Storage tab with bucket selection, folder breadcrumbs, and an
  objects table.
- GCP Compute Engine foundation: `gcpadapter` lists VMs via
  `gcloud compute instances list`, `WorkspaceSnapshot` carries
  `gcpComputeInstances` / status, catalogue promotes `gcp-compute` to a live
  service (`inventoryScope: gce`), and the desktop Compute Engine tab shows
  the inventory.
- Azure Storage signed read links: `azure.storage.presignBlob` issues a
  short-lived read SAS URL for the selected blob (no write mode required).
  The blob inspector offers a "Signed link (1h)" control with copy support.
- GCP Cloud Storage foundation: `gcpadapter` lists buckets via
  `gcloud storage buckets list`, `WorkspaceSnapshot` carries
  `gcpStorageBuckets` / status, catalogue promotes `gcp-storage` to a live
  service (`inventoryScope: gcs`), and the desktop Storage tab shows the
  inventory.
- AWS CloudWatch Logs filter/search: `aws.logs.filterEvents` searches recent
  events for the selected log group with an optional CloudWatch filter pattern.
  The Logs workspace panel adds a Search control in the inspector.
- Azure PostgreSQL Flexible Server start/stop write actions:
  `azure.postgres.startServer` and `azure.postgres.stopServer`, gated by Azure
  write mode, with Start/Stop buttons on the PostgreSQL workspace panel.

### Changed

- Daemon lab check-registry construction moves into `internal/app/labs` via
  `CheckDeps`, `NewRegistry`, `NewRunnerFromDeps`, and `LazyRunner`
  (architecture F-029 Phase 6b). The façade supplies inventory adapter funcs
  only and no longer owns `NewRegistry` or a labs runner adapter. AWS
  invoke-write ops remain on the façade behind `WriteExecutor`.
- Daemon labs RPCs (`labs.start`, `labs.get`, `labs.verifyStep`, `labs.runAction`,
  `labs.reset`) and startup fault recovery move into `internal/app/labs` with
  discovery/session/invalidator, deployment, recipe, runner, and write-executor
  ports (architecture F-029 Phase 6a).
- Daemon Azure remaining sync write RPCs move into `internal/app/azure` with
  resource group, VM, Front Door, and queue writer ports (architecture F-029
  Phase 5d): resource group create/delete, VM invoke actions, Front Door cache
  purge and topology refresh, and storage queue purge. Façade keeps thin wrappers
  only. Bastion list/connect stay on the façade (local CLI launch, not write-mode
  cloud mutations).
- Daemon Azure sync write RPCs move into `internal/app/azure` with writer ports and
  shared authorise/finish helpers (architecture F-029 Phase 5c): storage create
  account/container, blob upload/delete/copy/folder/presign, Key Vault set/reveal,
  PostgreSQL start/stop, Functions invoke, App Service create/settings/actions/slots,
  and WAF policy mode/rule/exclusion mutations. Façade keeps thin wrappers only.
- Daemon Azure selection RPCs (resource group, VM, storage account/container/blob
  and prefix filter, web app/slot, Log Analytics workspace, WAF policy, Front Door
  profile/endpoint/origin group, Function App/function, Key Vault vault/secret,
  Cosmos account/database/container, PostgreSQL server, queue) move into
  `internal/app/azure` with session/workspace/activity ports (architecture F-029
  Phase 5b).
- Daemon Azure inventory RPC (`azure.inventory.get`) moves into
  `internal/app/azure` with pure scope helpers and session/workspace ports
  (architecture F-029 Phase 5a). The RPC still returns a scoped
  `WorkspaceSnapshot` (not a typed slice).
- Daemon AWS inventory RPC (`aws.inventory.get`) moves into `internal/app/aws`
  with pure slice projection and session/workspace ports.
- Daemon AWS selection RPCs (region/resource select across S3, EC2, Lambda,
  DynamoDB, SQS, SNS, RDS, ECS, EKS, CloudFormation, EventBridge, Route 53,
  ELB, KMS, API Gateway, Secrets Manager, Logs, IAM) move into
  `internal/app/aws` with session/workspace/activity/invalidator ports.
- Daemon AWS sync write RPCs move into `internal/app/aws` with writer ports and
  shared authorise/finish helpers: SQS, SNS, DynamoDB, IAM create-role, Secrets
  reveal, S3 delete/create/copy/folder, Lambda describe/invoke/create/delete,
  Logs create/put, and EC2 runInstances.
- Daemon AWS async job RPCs move into `internal/app/aws` with lifecycle and
  extended S3 writer ports: S3 loadMore/upload/presign/validateUrl jobs, EC2
  invoke/terminate, and RDS start/stop. Façade keeps thin wrappers only.

## [0.9.12] - 2026-08-01

### Changed

- Daemon application domain extraction (architecture F-029 Phases 0–3):
  - exact 171-method RPC contract guards and façade snapshot tests
  - `internal/app/runtime` owns Docker probing, emulators, and runtime caches
  - `internal/app/deployment` owns recipes, OpenTofu install, and deploy lifecycle
  - `internal/app/sessionport` exposes narrow session/workspace/invalidation ports
- Recipe zip import rejects archive paths containing `..` before extraction
  (Zip Slip hardening).
- Greptile skips Dependabot/Renovate bot authors and dependency branches via
  root `greptile.json`.
- Dependency consolidation for open bot package bumps (desktop, AWS SDK Go v2,
  recipe sample APIs).
- `aws.inventory.get` returns a typed, service-scoped inventory slice instead of
  serialising the full workspace snapshot. Desktop callers validate and merge
  the slice so unrelated AWS service state is preserved.
- Desktop session, workspace snapshot, and provider/profile selection state are
  provided via `WorkspaceSessionProvider`, removing nine more fields from
  `WorkspaceTabRouterProps` (architecture F-028 slice 4).
- Desktop workspace navigation, Azure overview selection, deep-link refs, Lambda
  create-form state, and Azure cross-view prefill state are provided via
  `WorkspaceNavigationProvider`. This removes twelve live fields and four
  unused legacy page-state fields from `WorkspaceTabRouterProps` (architecture
  F-028 slice 3).
- Desktop Azure inventory and selection callbacks are provided via
  `AzureActionsProvider` instead of the workspace tab router prop bag, removing
  seven more fields from `WorkspaceTabRouterProps` (architecture F-028 slice 2).

## [0.9.11] - 2026-07-25

### Changed

- Desktop AWS inventory and write callbacks are provided via
  `AwsActionsProvider` instead of the workspace tab router prop bag, cutting
  about seventy fields from `WorkspaceTabRouterProps` (architecture F-028
  slice 1).

### Added

- Non-blocking ESLint (TypeScript + react-hooks) and golangci-lint (govet,
  staticcheck, errcheck, ineffassign) in CI and as `pnpm lint` /
  `lint:desktop` / `lint:backend` scripts, so lint debt can be sized before
  becoming a merge gate (architecture F-030). Desktop keeps TypeScript 7 for
  `tsc` via `@typescript/native`, while the `typescript` package name resolves
  to the TypeScript 6 API package that typescript-eslint still requires.

### Fixed

- Daemon deploy `Registry` guards factory/target maps and option updates with
  an `RWMutex`, so a shared engine used by concurrent RPC workers cannot panic
  on concurrent map writes if registration happens after construction. The
  backend race script also covers `internal/deploy` (architecture F-031).

- Daemon `session.selectProvider` and `session.selectProfile` no longer clear
  `IsLocked`. A locked workspace must be closed with `session.unlock` first so
  alternate RPC clients cannot drop a lock without the desktop leave-workspace
  confirmation (architecture F-011). The UI unlocks after confirm, then selects.
  Refusal returns PublicError stable code `session_locked` with SafeMessage
  unlock guidance instead of a plain error that became generic `internal_error`.
- Desktop Vitest no longer ignores coverage thresholds and reporters: removed
  shadowing `apps/desktop/vitest.config.ts` so test + coverage settings live
  only in `vite.config.ts`. CI `test:desktop:coverage` now enforces the gate
  and emits `lcov.info` plus `coverage-summary.json` (architecture F-027).
- Discovery profile attributes redact sensitive credential values
  (`aws_secret_access_key`, session tokens, passwords, and related fields) on
  the wire as `••••••••` while keeping `sensitive: true` for the UI. Full
  secrets remain in local CLI config files; the daemon still loads credentials
  from disk/env for AWS/Azure SDKs. No `profiles.reveal` RPC yet (architecture
  F-015). PlaceholderView no longer offers a functional reveal when the value
  is already the daemon redaction placeholder; fixtures that still carry a real
  value keep the reveal toggle.

- Daemon Docker and emulator status probes derive timeouts from the RPC request
  context instead of `context.Background()`, so a cancelled request aborts
  Docker dials and status probes early rather than waiting out the full probe
  timeout (architecture F-020). Cancelled probes no longer write
  `Reachable=false` into the shared Docker unreachable or runtime-status caches,
  so one aborted poll cannot make healthy Docker look unavailable to later
  callers until the TTL expires.
- Daemon secrets cipher re-seals legacy plaintext on Open (counted and logged)
  and deployment load writes the sealed form back to the store, so sensitive
  values from older builds do not remain readable at rest forever (architecture
  F-008).
- Daemon app Docker host fallback uses `dockerruntime.ResolveDockerHost` instead
  of the foundation-era `detectDockerHost`, so Windows diagnostics report the
  default named pipe (`npipe:////./pipe/docker_engine`) instead of an empty host
  with a deferred-probe message when the live Docker client is nil or Snapshot
  errors (architecture F-016).

### Changed

- Local Runtime config copy no longer claims isolation from default cloud CLI
  configuration. Preparing a profile dual-writes app-managed files under the
  local config root and a named entry in the user's AWS config/credentials or
  Azure profile so Connect can discover it (architecture F-019).
- Daemon JSON-RPC transport (`internal/rpc`) no longer imports `internal/app`.
  Shared `PublicError` and `Notifier` contracts live in `internal/rpcapi`; app
  keeps concrete error helpers and type aliases so handlers stay unchanged
  (architecture F-006).
- Daemon `cloudsprocketd` cancels RPC Serve via `signal.NotifyContext` on
  SIGINT/SIGTERM instead of a bare `context.Background()`. Tauri still owns
  sidecar lifetime through stdin EOF; signal cancel is for alternate hosts and
  manual stops. Serve observes context cancellation without changing the line
  protocol (architecture F-007).
- Desktop runtime actions collapse LocalStack and floci-az start/stop/recreate
  pipelines into one `invokeEmulatorAction(emulatorId, action, options?)` plus
  a shared status poller (recreate 95s vs default 22s timeouts preserved;
  LocalStack auth token remains options-only). Public wrappers keep App and
  Runtime View call sites stable (architecture F-018 R4).
- Local Runtime virtualisation poll requests engine and emulator status only
  (`runtime.get`). Emulator log tails load once when opening the tab, on
  Refresh Logs, and after start/stop/recreate actions, so idle polling no
  longer pulls both Docker log streams every 5s (architecture F-017 R3).
- Workspace snapshot rebuilds on single-service AWS/Azure mutation and job
  completion paths use scoped `workspaceSnapshotOptions` (service scope plus
  skip opposite cloud) so handlers no longer re-enrich every inventory
  accidentally. Wire shape is unchanged (architecture F-004 Phase 0).
- Daemon `app.Service` construction uses an explicit `Deps` struct via
  `NewFromDeps`; production wiring in `cloudsprocketd` no longer passes ~23
  positional inventory arguments. `New` and `NewWithRuntimes` remain as
  compatibility wrappers for tests (architecture F-002).
- Desktop backend client splits the browser mock into `backend-mock.ts`, loaded
  only via dynamic import when `__ENABLE_BROWSER_MOCK__` is true. Tauri builds
  (when `TAURI_ENV_PLATFORM` is set) define the flag false so mock fixtures are
  not shipped in the production bundle (architecture finding F-003).
- Daemon JSON-RPC dispatch uses a method registry map instead of a large switch (#262)
- Daemon RPC handler registration is split into domain helpers (core, AWS, Azure,
  deploy, labs, runtime) while keeping the same method surface and dispatch path
- SQLite store uses versioned `schema_migrations` so future schema changes can
  be applied in order; existing databases record baseline version 1 without
  data loss
- Daemon renames LocalStack-named status/start DTOs to generic emulator names
  (`EmulatorStatusDetail`, `EmulatorStartOptions`); JSON field tags and wire
  payloads are unchanged (architecture F-014 R1)
- Daemon extracts shared Docker emulator lifecycle helpers into
  `internal/emulatordocker` (client interface, log/env helpers, remove managed
  container); LocalStack and floci-az managers keep product policy (architecture
  F-014 R2)

## [0.9.10] - 2026-07-22

### Added

- Navigation history with Alt+Left/Right and palette Back/Forward commands (#213)
- Jump back in recents and pin favourite services, persisted in localStorage (#213)
- Command palette resource search over the loaded workspace inventory (#213)
- Deploy rail badge for in-progress and failed jobs (#213)
- Keyboard shortcuts: Ctrl/Cmd+1–9 for rail areas, [ / ] to cycle tabs, `?`
  cheatsheet (#213)
- Copy as CLI for the selected inventory resource (palette action) (#213)
- Deployment outputs can open matching inventory resources when the value is a
  resource identifier (#213)
- Applied and planned deployments show resource changes with inventory deep links
  where the OpenTofu type maps to a workspace tab (#245)
- Lambda inspector cross-link to open the matching CloudWatch Logs group in
  inventory when the group is known (#246)

### Fixed

- Docker Compose deploy target rewrites the managed LocalStack stack with
  `LOCALSTACK_AUTH_TOKEN` and the Docker socket mount, fails fast when LocalStack
  exits for a missing 2026 licence, and times out `compose up` instead of
  hanging on silent preflight heartbeats
- Deploy Stop cancels status immediately and notifies the UI; Stop also works when
  Docker Compose preflight is hanging
- Failed `az extension list` results are no longer cached for the full success
  TTL (#213)
- Workspace snapshot runtime probes no longer hold `runtimeStatusMu` across
  Docker/emulator I/O, so Local Runtime polls are not blocked behind cold
  snapshots (#213)
- Windows build steps resolve bare cwd-local scripts with `.\` when
  `NoDefaultCurrentDirectoryInExePath` is set (#213)
- OpenTofu progress and timeout heuristics match resource address lines
  (`: Creating...`) more tightly, reducing false phase matches (#213)
- Alt+Left/Right navigation does not fire while typing in inputs or when the
  command palette is open (#213)
- `golang.org/x/text` bumped to v0.39.0 for GO-2026-5970 (#245)

## [0.9.9] - 2026-07-19

### Added

- Shared OpenTofu provider plugin cache under the app config directory so large
  providers such as azurerm download once and are reused across deployments
  (#194)
- Recipe gallery run-target badges (floci-az, LocalStack, Cloud Azure, Cloud
  AWS) and an Any target / local runtime / Cloud only filter (#195)

### Changed

- Deploy UI surfaces multi-line OpenTofu failures, quiet-period progress guidance,
  and a first-run PostgreSQL local apply banner (not cloud-only) (#202)
- Progress heartbeats describe provider downloads, long creates/destroys, and
  state refresh more clearly (#202)
- Windows Remove/Stop also unlocks `terraform-provider-*` processes under the
  shared plugin cache when hardlinks report that path (#202)
- Azure Function App recipes are cloud-only: no floci-az target is offered and
  a plan guard rejects floci-az plans that need App Service or Functions
  hosting (#195)
- Local runtime health on Overview appears only for local workspaces and is
  scoped per provider: Docker plus LocalStack for local AWS, Docker plus
  floci-az for local Azure (#195)
- Inventory timestamps across Secrets Manager, SQS, CloudWatch Logs, Azure
  Queues, and IAM use the shared British UTC formatter, with raw values kept on
  hover (#193)

### Fixed

- FormatRunError distinguishes provider download timeouts from long resource
  creates (including local PostgreSQL image pull) and Access is denied lock
  cases (#202)
- Deployments no longer hang silently on provider installs: a download notice
  before init, still-working heartbeats after 45 quiet seconds, a 10-minute
  init timeout, and failures that include the last OpenTofu output (#194)
- Secrets Manager rotation shows Enabled, Disabled, or Unknown instead of
  collapsing disabled secrets into unknown (#201)
- `TF_PLUGIN_CACHE_DIR` is only injected when the app config directory is a
  non-empty absolute path (#201)
- The floci-az App Service guard scans every root module `.tf` file and matches
  resource blocks only, so split Terraform files cannot bypass it and comments
  cannot falsely flag a recipe
- Progress heartbeat detection no longer treats OpenTofu's own `Still
  creating...` resource lines as heartbeat output, so they keep resetting the
  quiet timer

### Documentation

- Labs platform notes for cleaning orphan `floci-az-pg-*` containers after a
  failed destroy/cancel; PostgreSQL lab recipe connection and timing honesty
  (#202)

## [0.9.8] - 2026-07-16

### Added

- Server-side policy guardrails for public S3 access, internet-exposed
  management ports, IAM wildcard actions, required tags, and region allowlists
  (#187)
- Plan-bound typed overrides for blocked live deployments, with Activity audit
  records and warning-only enforcement for local emulator targets (#187)

### Changed

- Drift checks now use a separate saved plan so they cannot overwrite the plan
  reviewed for apply (#187)

## [0.9.7] - 2026-07-15

### Added

- First vendor-neutral chaos lab: the queue-worker lab can pause the managed
  Docker Compose runtime, verify the outage, and restore it automatically
  (#181)
- Step-level fault capability reasons with graceful skipping on unsupported
  local runtimes and cloud profiles (#181)

### Fixed

- Active lab faults are journalled before injection and recovered on daemon
  restart, reset, later lab actions, and normal step completion (#181)
- Docker unpause recovery is idempotent when a container is already running or
  has been removed (#181)
- Production fault injection rejects container targets outside the managed
  runtime allowlist (#181)

## [0.9.6] - 2026-07-14

### Added

- Tailored production and localhost-only development Content Security Policies
  for the desktop shell (#171)
- CodeQL, production dependency audits, Dependabot, coverage gates, release
  SBOM generation, and GitHub build provenance attestations (#171)
- Release-signing prerequisites and fail-closed distribution requirements for
  Windows and macOS (#171)

### Fixed

- Secret-key corruption or read failures now stop startup instead of replacing
  the key or allowing sensitive deployment data to fall back to plaintext
  persistence (#171)
- Deployment status changes now roll back and stop notifications when sealed
  persistence fails, keeping the UI and stored state consistent (#171)
- JSON-RPC requests now have size and concurrency limits, panic recovery, safe
  stable errors, and file-backed diagnostics (#171)
- Desktop bridge requests now time out after 120 seconds and clean up pending
  request state (#171)

### Changed

- Go is pinned to 1.26.5 and current vulnerable Rust transitive dependencies are
  updated (#171)
- Product story for this release: safer local operation and verifiable release
  artefacts

## [0.9.5] - 2026-07-14

### Added

- Lab verification breadth: eight new check types (`s3.object`,
  `dynamodb.item`, `lambda.invoke`, `logs.contains`, `secrets.value`,
  `sns.subscription`, `azure.blob`, `azure.queue-depth`) with unit tests in
  `labs/checks` (#166)
- Adapter reads for lab checks: S3 `GetObject`, DynamoDB `GetItem`, Azure
  queue approximate message count (#166)
- Generalised lab `invoke-write` dispatch: `sqs.send`, `dynamodb.put`,
  `sns.publish`, `lambda.invoke`, `logs.put`, `s3.upload` (#166)
- Catalogue retrofit so most guided labs include at least one automated
  verify on a key step (9 → 24 of 33 labs) (#166)

### Fixed

- Side-effecting verifies (`lambda.invoke`, `secrets.value`) require write
  mode, matching workspace RPCs (#166)
- Unknown `compare` operators fail validation and runtime instead of a silent
  false check result (#166)
- Empty `secrets.value` criteria after template resolve no longer vacuous-pass
  (#166)
- `logs.put` lab action requires a non-empty message (#166)

### Changed

- Product story for this release: guided labs that actually verify, not only
  mark complete

## [0.9.4] - 2026-07-12

### Added

- First-run onboarding wizard: five-step guided setup for providers, local
  runtime checks, profile summary, and deep-link into a beginner lab (#160)
- Domain-grouped workspace navigation with collapsible service headers (#157)
- Usability follow-ups: settings domain headings, British UTC timestamps,
  multi-auth focus handoff, safe lab markdown, structured import trust review,
  and a destructive reset command in the palette (#158)

### Fixed

- Onboarding deep link stays armed when the first-lab recipe fails to load
  (#160)
- Factory reset re-arms the onboarding wizard (#160)
- Imported multi-version recipes prefer the highest **semantic** version
  (`0.10.0` over `0.9.0`) instead of folder-name lexicographic order (#162)
- `FaultInjector` keeps Capabilities pause-only and exposes
  `PlannedFaultKinds` for future chaos backends without advertising
  unimplemented kinds (#162)
- Review polish for UTC labels and palette destructive metadata (#159)

### Changed

- Product story for this release: the app now teaches you (grouped nav,
  usability polish, onboarding)

## [0.9.3] - 2026-07-11

### Added

- A6 chaos foundation: `FaultInjector` seam with compose **pause** via docker
  pause/unpause, `LabStep.fault` schema, and inject/revert during lab verify
  (#150, #151, #153)

### Fixed

- S3 breadcrumb path changes clear the contains-search filter so folder filters
  do not stick across navigation (#153)

### Changed

- Dependency updates: pnpm 11.11, Vite 8.1.4, Vitest 4.1.10, Prettier 3.9.5,
  lucide-react 1.24, Radix UI primitives, AWS SDK JS v3 and Go v2 monorepos,
  Azure SDK monorepo (#146, #21, #116, #145, #64, #56, #154, #155, #147)

## [0.9.2] - 2026-07-10

### Added

- Unified Azure Storage and S3 path browsers (account/container or bucket +
  breadcrumb path + objects + inspector) with sub-rail pages removed (#148)
- S3 folder browse via delimiter listing, Load more pagination, and client-side
  contains search over the loaded page (#148)
- Structured multi-line Azure storage list-error banners with plain-language
  guidance for network isolation and auth failures (#148)

### Fixed

- S3 listing loading indicators without multi-blink; path reset when switching
  buckets; object select no longer collapses Load more pages (#148)
- Load more surfaces list errors instead of reporting end of list (#148)
- Select popper sizing so multi-option dropdowns are not clipped (#148)

## [0.9.1] - 2026-07-10

### Added

- Recipe validation RPC (`recipes.validate`) for local folders: manifest, lab
  semantics, OpenTofu module inspect, and build/imageBuild coherence (#138)
- Zip import for recipes alongside folder import, with zip-slip-safe extract (#138)
- Import trust preview enrichment: providers, build commands, lab step count,
  content hash; acceptance writes `.import-trust.json` (#138)
- Developer Toolbox actions: validate folder, import folder/zip, accept/reject (#138)

### Changed

- Import blocks on validation errors until the recipe report is clean (#138)

## [0.9.0] - 2026-07-09

### Added

- Guided labs platform (schema, engine, runner, navigation) and lab sections on
  bundled service labs (#126, #127)
- Expanded app-deploy and service-lab catalogue, including static-site and
  scheduled-job recipes (#129, #131)
- A5 wave-2 labs: CloudFormation drift, Step Functions order flow, and Azure
  storage event function (#136)
- Deployment drift detection (B1): `CheckDrift`, UI badge/panel, persistence
  (#123 area + follow-ups)
- Deployment update flow (B2): re-plan applied deployments with revision history,
  version banner, and structured plan highlighting (#135)
- Basic recipe import/scaffold authoring (C2/C3) with trust preview before copy
  and path-safe import destinations (#135)
- Live recipe build-step log streaming during deploy (#133)
- Azure PostgreSQL Flexible Server local deploy path via floci-az (shipped
  earlier as #52 / v0.8.21; part of the local Azure runtime story for v0.9)

### Changed

- v0.9.0 UX batch for deploy errors, logs, gallery, and related desktop polish
  (#123)
- Pre-v0.9 backlog closed (ResourceTable breadth, storage depth, write RPC wiring)
  (#121)

### Fixed

- Recipe/test expectation cleanups after Greptile review on new catalogue
  content (#130)
- Post guided-labs improvements for runner, destroy, and floci-az (#127)

## [0.8.36] - 2026-07-09

### Changed
- Version bump ahead of next wave of plan work (recipes/labs + lifecycle).
- Post-Greptile fixes for recent recipe PRs integrated (via review branches).

## [0.8.35] - 2026-07-08

### Added

- CloudFormation and EventBridge inventory tabs migrated to shared
  `ResourceInventoryShell` + `ResourceTable` (#121)
- S3 copy object and create folder prefix workflows (write-gated) (#121)
- Azure Storage blob copy and folder prefix create workflows (write-gated) (#121)

### Fixed

- AWS write ops Phases 2–3 handlers were implemented but not registered in
  `service.go`; delete/create/run/terminate/RDS/Logs/IAM RPCs now route correctly
  (#121)
- S3 `CopyObject` URL-encodes copy-source keys with spaces and special characters
  (#121)
- Azure blob copy authorises the source with a read SAS and polls until the async
  copy completes (#121)
- CloudFormation stack row selection highlights the active stack again (#121)
- S3 copy preserves object key whitespace instead of trimming it (#121)

### Changed

- `docs/project-status.md` brought current; pre-v0.9 backlog marked complete (#121)

## [0.8.34] - 2026-07-07

### Added

- Developer Preview channel labelling in the README, connect screen, workspace
  strip, app menu, and window title (#119)
- Shared `release-channel` module for consistent pre-1.0 messaging (#119)

### Fixed

- README Developer Preview heading no longer renders Pandoc `{#id}` anchor syntax
  literally (#120)

## [0.8.33] - 2026-07-06

### Changed

- AWS write mode can be enabled on any locked AWS profile; live cloud profiles
  require an extra acknowledgement before mutating actions (#114)
- Inventory tables restored to full width with the inspector stacked below the
  table (#113)

### Fixed

- KMS sidebar icon now uses the official AWS KMS asset instead of a generic
  fallback (#114)
- S3 delete and other mutating actions stayed disabled after enabling write mode
  because action capabilities were not refreshed on toggle (#114)
- ResourceTable layout regression that crushed wide tables beside a fixed side
  inspector (#113)

## [0.8.32] - 2026-07-05

### Added

- AWS Route 53 tab with account-wide hosted zone inventory and record preview
  (#111)
- AWS ELBv2 tab with regional load balancer inventory and target group
  drill-down (#112)
- AWS KMS tab with encryption key listing, alias preview, and key metadata in
  the inspector (#112)

### Fixed

- Route 53 record pagination now uses `NextRecord*` tokens from the AWS API
  (#111)
- Route 53 record table row keys include `setIdentifier` for weighted and
  latency-based routing records (#111)

## [0.8.31] - 2026-07-05

### Added

- AWS CloudFormation tab with stack inventory, recent events, and copy helpers
  (#109)
- AWS EventBridge tab with event bus and rule listing (#109)
- AWS write operations Phases 2–3 (LocalStack / local endpoints only): S3 delete
  object and create bucket; EC2 run and terminate instances; Lambda delete
  function; RDS start and stop instance; CloudWatch Logs create log group and
  put log events; IAM create role (#110)

### Changed

- Nine AWS views migrated to the shared `ResourceInventoryShell` +
  `ResourceTable` split-pane pattern: SQS, SNS, RDS (#108); ECS, API Gateway,
  Secrets Manager, IAM, CloudWatch Logs, and EKS (#107)
- Official AWS service icons for ECS, EKS, API Gateway, and Secrets Manager in
  the sidebar and Services settings (`1d607c24`)

### Fixed

- EKS cluster row selection now keys on `clusterName` so the inspector stays in
  sync with the table (#107)
- RDS inspector copy actions no longer include an unreachable empty-state branch
  (#108)

## [0.8.30] - 2026-07-05

### Added

- AWS EKS inventory tab with deferred region and cluster loading, node group
  summary, and copy helpers for ARNs and CLI commands (#106)

### Changed

- `App.tsx` further decomposed: service preferences, app reset, write mode, and
  shell navigation extracted into dedicated hooks (#105)
- EC2, Lambda, and DynamoDB views migrated to the shared `ResourceInventoryShell`
  + `ResourceTable` split-pane pattern (#105); `App.tsx` reduced from about 2,009
  to about 1,466 lines

### Fixed

- EKS cluster listing skips clusters the caller cannot describe, so partial IAM
  access no longer returns an empty inventory (#106)

## [0.8.29] - 2026-07-05

### Fixed

- Services settings no longer crash when `disabledProviders` is returned as JSON
  `null` from a fresh install (#103)
- Reset app data now clears service preferences (`preferences.json`) and restores
  default service enablement (#103)

## [0.8.27] - 2026-07-05

### Added

- Service enablement (Phases 1 to 3): a unified service catalogue in the daemon, a
  `preferences.json` store, and `preferences.get` / `preferences.update` RPCs (#82)
- Services settings page (App menu, Services) with hierarchical provider and service
  toggles; disabled services are fully dormant (no tab, no polling, no data fetch) (#82)
- Overview hint listing resources that exist in disabled services (#82)

### Changed

- Workspace tabs, AWS/Azure enrichers, and the Connect view now respect service
  preferences; the active tab falls back to Overview when its service is disabled (#82)

### Fixed

- Mutex deadlocks in `reconcileSession` and EC2 async jobs
- Release pipeline: site rebuild no longer fails the publish job, and the rebuild
  token is kept out of clone URLs and shell interpolation

## [0.8.26] - 2026-07-05

### Added

- AWS Secrets Manager tab with write-gated secret reveal, completing AWS expansion
  Phase 2 (#81)

### Changed

- README feature matrix expanded

## [0.8.25] - 2026-07-04

### Added

- AWS ECS tab with deferred inventory scope (#79)
- AWS API Gateway tab covering REST and HTTP APIs (#80)

### Changed

- Extracted `use-aws-actions`, `use-azure-actions`, and `use-runtime-actions` hooks
  from `App.tsx`, reducing it from about 2,900 to about 1,900 lines (#78)

## [0.8.24] - 2026-07-04

### Changed

- Completed the `App.tsx` decomposition: session and workspace loading hooks (#75),
  workspace snapshot normalisation at the IPC boundary (#76), and per-provider tab
  routers under `components/workspace/` (#77); `App.tsx` reduced from about 4,900 to
  about 2,900 lines across the series

## [0.8.23] - 2026-07-04

### Added

- Deferred AWS inventory: workspace open loads S3 and EC2 only, other services fetch
  on first tab activation via the new `aws.inventory.get` RPC (#69)
- Runtime health strip on the Overview tab and "Soon" badges on upcoming GCP
  navigation entries (#70)
- Per-action capability model: Go handlers publish `actionCapabilities` on workspace
  snapshots, and all AWS write buttons plus Azure core and tools views show a
  disabled reason when an action is unavailable (#71, #72, #73)

## [0.8.22] - 2026-07-04

### Added

- New application icon across all platforms, with the master logo committed to
  `design/brand/` (#68)

### Removed

- Archived PySide6 legacy application (#67)
- Termius sponsorship attribution (programme ended)

### Changed

- Dependency updates: Tauri, React, Vitest, CodeMirror, AWS SDK for Go v2, and
  others via Renovate

### Fixed

- CI: downgraded a yanked `crossbeam-utils` version in `Cargo.lock`

## [0.8.21] - 2026-07-01

### Added

- Azure PostgreSQL Flexible Server: local deploy on floci-az, a dedicated workspace
  tab with connection reveal, and the `lab-postgres-flexible-azure` bundled recipe (#52)
- floci-az OpenTofu compatibility contract (`internal/flociazcompat`): metadata
  probing, TLS certificate trust (including Windows certificate store handling), and
  container environment defaults
- Docker socket mount for the floci-az container so docker-backed services such as
  PostgreSQL run as real sibling containers

## [0.8.20] - 2026-06-28

### Changed

- Rail and sidebar redesign: unified 32 by 32 glyph plates, official provider logos,
  profile badges, and rich tooltips (provider, profile, region, auth)
- New app menu popover in the rail footer housing settings, version, reset, theme,
  debug, and config paths; the context nav footer was slimmed down

## [0.8.19] - 2026-06-26

### Added

- Log Analytics: curated Application Insights query pack, lazy per-table schema
  loading with insert snippets, shared timespan options, and an Open in Portal link
- App Service: full setting value dialogue with copy, plus a sensitive-value reveal
  toggle for masked settings

### Fixed

- Front Door: Run query now uses the editor content instead of overwriting it; a new
  Apply filters button rebuilds KQL from the filter bar
- Log Analytics history stores the source query rather than the paginated executable
  KQL

## [0.8.18] - 2026-06-24

### Added

- WAF security workbench: overview dashboard, tracking-reference correlation with
  Front Door access logs, Application Gateway schema probe, and a false-positive
  exclusion playbook
- Tools navigation split separating operational tools from service tabs

### Changed

- Debounced the WAF overview refresh and skipped redundant configuration reloads

## [0.8.17] - 2026-06-24

### Added

- WAF logs: group-by aggregation, row limits, and server-side pagination

### Fixed

- WAF schema probing and KQL column alignment with real diagnostics columns

## [0.8.16] - 2026-06-24

### Changed

- Deploy engine made provider-agnostic; deduplicated AWS write and config code
- Magento Docker Compose recipe gained dual stack profiles with conditional form
  fields

### Fixed

- Hardened AWS write operations and the Magento installer following review
- Magento recipes moved to pullable Docker images; LocalStack dry-run blocked for
  the cloud-only AWS Magento recipe

## [0.8.15] - 2026-06-23

### Added

- Magento commerce recipes for AWS and Docker Compose

### Fixed

- Azure deploy credentials are routed to the selected target
- Completed the missing ElastiCache variable in `magento-commerce-aws`

## [0.8.14] - 2026-06-23

### Added

- Magento commerce Azure recipe and a cloud deploy target

### Fixed

- Azure service inventory loading states shown in tabs and dropdowns
- Workspace restored correctly after Refresh Discovery with lazy Azure inventory

## [0.8.13] - 2026-06-23

### Added

- Write-gated AWS operations: SQS send message and create queue, SNS publish and
  create topic, DynamoDB put and delete item (local endpoints only)

## [0.8.12] - 2026-06-23

### Fixed

- Review findings from the v0.8.11 lazy inventory work

## [0.8.11] - 2026-06-22

### Changed

- Azure inventory is now loaded lazily per service, cutting workspace open time

## [0.8.10] - 2026-06-23

### Changed

- Performance remediation: `runtime.get` poll split, parallel Azure enrichers,
  frontend code splitting, and table virtualisation

### Fixed

- Write-mode toggle behaviour and review follow-ups

## [0.8.9] - 2026-06-22

### Added

- Front Door endpoint cache purge

### Fixed

- WAF configuration load and Front Door refresh stability; topology loading
  indicators

## [0.8.8] - 2026-06-22

### Added

- App Service deployment slots: create, swap, and slot-aware detail views, plus
  create-plan options

## [0.8.7] - 2026-06-22

### Added

- Front Door topology tab with access-log KQL presets

### Fixed

- App Service settings and plans now load into the workspace snapshot

## [0.8.6] - 2026-06-22

### Added

- App Service application settings write (container environment variables)
- Phase 1 App Service operations and the WAF add-exclusion UI

## [0.8.5] - 2026-06-22

### Fixed

- Log Analytics schema browser no longer hangs

## [0.8.4] - 2026-06-22

### Fixed

- Azure CLI discovery on the macOS GUI PATH

## [0.8.3] - 2026-06-22

### Fixed

- Release uploads installer artefacts only; added Azure CLI extension checks

## [0.8.2] - 2026-06-21

### Changed

- Relicensed under AGPL-3.0 with SPDX headers throughout

## [0.8.1] - 2026-06-21

### Added

- CI publishes a GitHub Release automatically when a version tag is pushed

## [0.8.0] - 2026-06-21

### Added

- Azure workspace expansion: write mode, resource group CRUD, and blob storage
- Storage accounts, VM actions, and App Service views
- Azure Functions (browse and invoke), Key Vault secrets (list, reveal, set),
  Cosmos DB browsing, and Storage Queues with message peek
- Entra ID directory panel (users, groups, app registrations)
- Log Analytics KQL query editor and runner (floci-az local and Azure cloud)

## [0.7.0] - 2026-06-21

### Added

- Pluggable deploy target registry and runtime abstraction
- docker-compose runtime with post-apply retry and migrations
- Recipe catalogue expansion: DynamoDB full stack, batch worker, Go container,
  Python Postgres, and lab recipes
- Runtime picker with target-aware deployment output links

### Fixed

- SQLite access serialised so deployment status writes are not dropped under load

## [0.6.1] - 2026-06-16

### Fixed

- LocalStack open links built with the gateway port

## [0.6.0] - 2026-06-16

### Added

- Recipe platform expansion with a larger bundled catalogue, deploy gallery
  sections, and app handoff UX
- Async, webhook, and image pipeline recipes
- Recreate actions for LocalStack and floci-az

### Fixed

- LocalStack persistence uses a Docker volume on Windows
- LocalStack start settings from the UI are honoured
- RDS port publishing and container `DATABASE_URL` in recipes
- App version display moved to the sidebar footer

## [0.5.0] - 2026-06-16

### Changed

- Daemon refactor: modularised the app service layer and extracted snapshot
  enrichers into per-domain files

## [0.4.0] - 2026-06-16

### Added

- AWS service expansion: Lambda (list, describe, invoke, create with custom code
  and IAM role provisioning), DynamoDB (list, describe, sample scan), SQS with
  message peek, SNS, RDS, CloudWatch Logs, and IAM panels
- Session write mode with a profile capability ceiling and a top-bar toggle

## [0.3.0] - 2026-06-15

### Added

- Command palette (Cmd/Ctrl+K)
- Sensitive deployment values sealed at rest (AES-256-GCM with a per-install key)
  and masked outputs with reveal
- Cancel in-flight deployments, stop running deployments, and delete deployment
  records
- Preflight target connectivity check before deploy
- Static-site and scheduled-job bundled recipes; live build-step output streaming
- Runtime log commands surfaced for deployments

### Fixed

- CloudFront outputs flagged as unreachable on LocalStack
- Console windows no longer flash when spawning tofu, npm, or az on Windows
- Azure inventory calls bounded so a stalled response cannot hang `workspace.get`

### Changed

- Cached the unreachable Docker verdict to cut Local Runtime poll churn

## [0.2.2] - 2026-06-14

### Added

- OpenTofu deploy engine: locate, install, and run
- Recipe model, manifest loader, and deploy lifecycle (plan, apply, destroy) with
  job streaming and persistence
- Deploy section UI: recipe gallery, variable form, and plan/apply/destroy controls
- Real application code deploys: build hooks, backend source directories, and
  frontend upload
- Traditional container recipe (ECS Fargate, ALB, RDS, CloudFront)
- LocalStack-reachable URLs for local deployment outputs

### Fixed

- Docker socket mounted into LocalStack so Lambda containers work

## [0.2.1] - 2026-06-14

### Added

- Local Azure resource listing from floci-az via the ARM SDK

## [0.2.0] - 2026-06-13

### Changed

- Complete UI rebuild on Tailwind v4 and shadcn/ui; Cloudscape removed entirely
  (app shell, Connect view, Overview, resource screens, RuntimeView, notifications)
- Workspaces open with one click; the lock metaphor was retired
- Notification model reworked

### Added

- Tabbed S3 object detail pane (Overview, Metadata, Share, Code)
- Custom signed-URL durations up to 7 days with the generated link surfaced

## [0.1.20] - 2026-06-09

### Added

- Azure local runtime controls (floci-az emulator) and local emulator profiles

### Fixed

- Docker probes no longer hang the workspace; floci-az restored
- Emulator persistence and environment controls locked while running
- `session.unlock` unblocked from the polled workspace fetch

## [0.1.19] - 2026-06-06

### Added

- Local Runtime foundation: Docker runtime service with readiness reporting,
  LocalStack manager with runtime controls, logs, and start configuration
- Virtualisation made globally available with controls in its own menu

### Fixed

- Late LocalStack starts reconciled; action failures recover with better feedback
- Desktop event bridge rendering and startup state guards

## [0.1.18] - 2026-05-17

### Added

- Azure inventory workspace views (read-only)

### Changed

- Streamlined workspace navigation; S3 URL tools decoupled from bucket context

## [0.1.17] - 2026-05-15

### Changed

- Refreshed active app dependencies; added a desktop type-check CI gate

## [0.1.16] - 2026-05-12

### Added

- EC2 action history and on-demand inventory refresh
- macOS local app workflow and Renovate dependency management

### Changed

- Hardened S3 workspace diagnostics; refined S3 object workflows and the setup shell

### Fixed

- Tauri PNG icons kept in RGBA format

## [0.1.15] - 2026-05-04

### Added

- EC2 lifecycle actions (start, stop) for local endpoint profiles

## [0.1.14] - 2026-04-29

### Fixed

- S3 prefix input kept local to the view; CI installs pnpm before the node cache

## [0.1.13] - 2026-04-29

### Fixed

- Stabilised S3 prefix search

## [0.1.12] - 2026-04-29

### Fixed

- Debounced workspace search filters

## [0.1.11] - 2026-04-29

### Added

- EC2 workspace tab wired into the shell; non-destructive workspace parity

## [0.1.10] - 2026-04-28

### Changed

- Test guard added against Windows console executables

## [0.1.9] - 2026-04-28

### Added

- EC2 backend inventory and actions

### Fixed

- Windows app console hidden

## [0.1.8] - 2026-04-28

### Added

- EC2 SDK module groundwork

### Fixed

- Windows sidecar console hidden

## [0.1.7] - 2026-04-26

### Added

- Completed the S3 workspace action set

## [0.1.6] - 2026-04-26

### Changed

- Improved S3 listing and metadata handling

## [0.1.5] - 2026-04-24

### Changed

- Split frontend vendor chunks to improve build output

## [0.1.4] - 2026-04-16

### Added

- S3 object metadata drill-down and prefix filters

## [0.1.3] - 2026-04-15

### Fixed

- S3 bucket region resolution for object listing

## [0.1.2] - 2026-04-15

### Added

- S3 bucket browsing and workspace inventory
- Upgraded desktop setup flow and collections

### Changed

- Desktop shell views split into modules

## [0.1.1] - 2026-04-15

Initial public release.

### Added

- Desktop shell with AWS profile discovery, profile detail views, and sensitive
  value protection
- First S3 workspace: object browsing with a right-hand inspector, prefix
  filtering, metadata drill-down, uploads with multipart planning, and signed URL
  generation with duration controls
- Lockable workspace flow and session landing page
- Automated Windows and macOS CI builds

[Unreleased]: https://github.com/Ali-Shaikh/cloud-sprocket/compare/v0.9.13...HEAD
[0.9.13]: https://github.com/Ali-Shaikh/cloud-sprocket/compare/v0.9.12...v0.9.13
[0.9.12]: https://github.com/Ali-Shaikh/cloud-sprocket/compare/v0.9.11...v0.9.12
[0.9.11]: https://github.com/Ali-Shaikh/cloud-sprocket/compare/v0.9.10...v0.9.11
[0.9.10]: https://github.com/Ali-Shaikh/cloud-sprocket/compare/v0.9.9...v0.9.10
[0.9.9]: https://github.com/Ali-Shaikh/cloud-sprocket/compare/v0.9.8...v0.9.9
[0.9.8]: https://github.com/Ali-Shaikh/cloud-sprocket/compare/v0.9.7...v0.9.8
[0.9.7]: https://github.com/Ali-Shaikh/cloud-sprocket/compare/v0.9.6...v0.9.7
[0.9.6]: https://github.com/Ali-Shaikh/cloud-sprocket/compare/v0.9.5...v0.9.6
[0.9.5]: https://github.com/Ali-Shaikh/cloud-sprocket/compare/v0.9.4...v0.9.5
[0.9.4]: https://github.com/Ali-Shaikh/cloud-sprocket/compare/v0.9.3...v0.9.4
[0.9.3]: https://github.com/Ali-Shaikh/cloud-sprocket/compare/v0.9.2...v0.9.3
[0.9.2]: https://github.com/Ali-Shaikh/cloud-sprocket/compare/v0.9.1...v0.9.2
[0.9.1]: https://github.com/Ali-Shaikh/cloud-sprocket/compare/v0.9.0...v0.9.1
[0.9.0]: https://github.com/Ali-Shaikh/cloud-sprocket/compare/v0.8.36...v0.9.0
[0.8.36]: https://github.com/Ali-Shaikh/cloud-sprocket/compare/v0.8.35...v0.8.36
[0.8.35]: https://github.com/Ali-Shaikh/cloud-sprocket/compare/v0.8.34...v0.8.35
[0.8.34]: https://github.com/Ali-Shaikh/cloud-sprocket/compare/v0.8.33...v0.8.34
[0.8.33]: https://github.com/Ali-Shaikh/cloud-sprocket/compare/v0.8.32...v0.8.33
[0.8.32]: https://github.com/Ali-Shaikh/cloud-sprocket/compare/v0.8.31...v0.8.32
[0.8.31]: https://github.com/Ali-Shaikh/cloud-sprocket/compare/v0.8.30...v0.8.31
[0.8.30]: https://github.com/Ali-Shaikh/cloud-sprocket/compare/v0.8.29...v0.8.30
[0.8.29]: https://github.com/Ali-Shaikh/cloud-sprocket/compare/v0.8.28...v0.8.29
[0.8.28]: https://github.com/Ali-Shaikh/cloud-sprocket/compare/v0.8.27...v0.8.28
[0.8.27]: https://github.com/Ali-Shaikh/cloud-sprocket/compare/v0.8.26...v0.8.27
[0.8.26]: https://github.com/Ali-Shaikh/cloud-sprocket/compare/v0.8.25...v0.8.26
[0.8.25]: https://github.com/Ali-Shaikh/cloud-sprocket/compare/v0.8.24...v0.8.25
[0.8.24]: https://github.com/Ali-Shaikh/cloud-sprocket/compare/v0.8.23...v0.8.24
[0.8.23]: https://github.com/Ali-Shaikh/cloud-sprocket/compare/v0.8.22...v0.8.23
[0.8.22]: https://github.com/Ali-Shaikh/cloud-sprocket/compare/v0.8.21...v0.8.22
[0.8.21]: https://github.com/Ali-Shaikh/cloud-sprocket/compare/v0.8.20...v0.8.21
[0.8.20]: https://github.com/Ali-Shaikh/cloud-sprocket/compare/v0.8.19...v0.8.20
[0.8.19]: https://github.com/Ali-Shaikh/cloud-sprocket/compare/v0.8.18...v0.8.19
[0.8.18]: https://github.com/Ali-Shaikh/cloud-sprocket/compare/v0.8.17...v0.8.18
[0.8.17]: https://github.com/Ali-Shaikh/cloud-sprocket/compare/v0.8.16...v0.8.17
[0.8.16]: https://github.com/Ali-Shaikh/cloud-sprocket/compare/v0.8.15...v0.8.16
[0.8.15]: https://github.com/Ali-Shaikh/cloud-sprocket/compare/v0.8.14...v0.8.15
[0.8.14]: https://github.com/Ali-Shaikh/cloud-sprocket/compare/v0.8.13...v0.8.14
[0.8.13]: https://github.com/Ali-Shaikh/cloud-sprocket/compare/v0.8.12...v0.8.13
[0.8.12]: https://github.com/Ali-Shaikh/cloud-sprocket/compare/v0.8.11...v0.8.12
[0.8.11]: https://github.com/Ali-Shaikh/cloud-sprocket/compare/v0.8.10...v0.8.11
[0.8.10]: https://github.com/Ali-Shaikh/cloud-sprocket/compare/v0.8.9...v0.8.10
[0.8.9]: https://github.com/Ali-Shaikh/cloud-sprocket/compare/v0.8.8...v0.8.9
[0.8.8]: https://github.com/Ali-Shaikh/cloud-sprocket/compare/v0.8.7...v0.8.8
[0.8.7]: https://github.com/Ali-Shaikh/cloud-sprocket/compare/v0.8.6...v0.8.7
[0.8.6]: https://github.com/Ali-Shaikh/cloud-sprocket/compare/v0.8.5...v0.8.6
[0.8.5]: https://github.com/Ali-Shaikh/cloud-sprocket/compare/v0.8.4...v0.8.5
[0.8.4]: https://github.com/Ali-Shaikh/cloud-sprocket/compare/v0.8.3...v0.8.4
[0.8.3]: https://github.com/Ali-Shaikh/cloud-sprocket/compare/v0.8.2...v0.8.3
[0.8.2]: https://github.com/Ali-Shaikh/cloud-sprocket/compare/v0.8.1...v0.8.2
[0.8.1]: https://github.com/Ali-Shaikh/cloud-sprocket/compare/v0.8.0...v0.8.1
[0.8.0]: https://github.com/Ali-Shaikh/cloud-sprocket/compare/v0.7.0...v0.8.0
[0.7.0]: https://github.com/Ali-Shaikh/cloud-sprocket/compare/v0.6.1...v0.7.0
[0.6.1]: https://github.com/Ali-Shaikh/cloud-sprocket/compare/v0.6.0...v0.6.1
[0.6.0]: https://github.com/Ali-Shaikh/cloud-sprocket/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/Ali-Shaikh/cloud-sprocket/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/Ali-Shaikh/cloud-sprocket/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/Ali-Shaikh/cloud-sprocket/compare/v0.2.2...v0.3.0
[0.2.2]: https://github.com/Ali-Shaikh/cloud-sprocket/compare/v0.2.1...v0.2.2
[0.2.1]: https://github.com/Ali-Shaikh/cloud-sprocket/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/Ali-Shaikh/cloud-sprocket/compare/v0.1.20...v0.2.0
[0.1.20]: https://github.com/Ali-Shaikh/cloud-sprocket/compare/v0.1.19...v0.1.20
[0.1.19]: https://github.com/Ali-Shaikh/cloud-sprocket/compare/v0.1.18...v0.1.19
[0.1.18]: https://github.com/Ali-Shaikh/cloud-sprocket/compare/v0.1.17...v0.1.18
[0.1.17]: https://github.com/Ali-Shaikh/cloud-sprocket/compare/v0.1.16...v0.1.17
[0.1.16]: https://github.com/Ali-Shaikh/cloud-sprocket/compare/v0.1.15...v0.1.16
[0.1.15]: https://github.com/Ali-Shaikh/cloud-sprocket/compare/v0.1.14...v0.1.15
[0.1.14]: https://github.com/Ali-Shaikh/cloud-sprocket/compare/v0.1.13...v0.1.14
[0.1.13]: https://github.com/Ali-Shaikh/cloud-sprocket/compare/v0.1.12...v0.1.13
[0.1.12]: https://github.com/Ali-Shaikh/cloud-sprocket/compare/v0.1.11...v0.1.12
[0.1.11]: https://github.com/Ali-Shaikh/cloud-sprocket/compare/v0.1.10...v0.1.11
[0.1.10]: https://github.com/Ali-Shaikh/cloud-sprocket/compare/v0.1.9...v0.1.10
[0.1.9]: https://github.com/Ali-Shaikh/cloud-sprocket/compare/v0.1.8...v0.1.9
[0.1.8]: https://github.com/Ali-Shaikh/cloud-sprocket/compare/v0.1.7...v0.1.8
[0.1.7]: https://github.com/Ali-Shaikh/cloud-sprocket/compare/v0.1.6...v0.1.7
[0.1.6]: https://github.com/Ali-Shaikh/cloud-sprocket/compare/v0.1.5...v0.1.6
[0.1.5]: https://github.com/Ali-Shaikh/cloud-sprocket/compare/v0.1.4...v0.1.5
[0.1.4]: https://github.com/Ali-Shaikh/cloud-sprocket/compare/v0.1.3...v0.1.4
[0.1.3]: https://github.com/Ali-Shaikh/cloud-sprocket/compare/v0.1.2...v0.1.3
[0.1.2]: https://github.com/Ali-Shaikh/cloud-sprocket/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/Ali-Shaikh/cloud-sprocket/releases/tag/v0.1.1

# Changelog

All notable changes to CloudSprocket are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
Installers for every release are published on the
[GitHub Releases](https://github.com/Ali-Shaikh/cloud-sprocket/releases) page.

## [Unreleased]

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

[Unreleased]: https://github.com/Ali-Shaikh/cloud-sprocket/compare/v0.9.1...HEAD
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

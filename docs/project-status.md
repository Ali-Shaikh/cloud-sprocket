# CloudSprocket project status

**Last updated:** 11 August 2026

**Latest release:** [v0.9.13](https://github.com/Ali-Shaikh/cloud-sprocket/releases/tag/v0.9.13)
**Recent releases:** v0.9.13 (GCP multi-cloud foundation, F-029 cloud domains, operator actions), v0.9.12 (application domain extraction spine F-029 Phases 0–3), v0.9.11 (F-028 AWS actions provider, F-030 linters)

**Post-v0.9.13 on `dev` (not yet released):** F-028 slices 5–7 (runtime emulator + action-status + Azure loading contexts), F-029 Phase 5e Bastion domain extract, F-029 Phase 6b/6c labs registry + invoke-write extract, AWS SDK Go patch bumps (#348).

CloudSprocket is a local-first desktop cloud workbench: React + TypeScript + Tauri v2 + Go sidecar. The PySide6 legacy app was removed in PR #67. The Tauri rewrite is the active product. The app is labelled **Developer Preview** (not production-ready).

---

## Done

### Core platform

- Tauri v2 desktop shell with Go JSON-RPC sidecar
- Multi-cloud profile discovery (AWS, Azure, GCP config visibility)
- Session/workspace model, SQLite persistence, write-mode gating for local endpoints and cloud profiles where permitted
- Local Runtime tab: Docker, LocalStack, floci-az emulator management
- OpenTofu deploy engine with 23 bundled recipes (AWS + Azure)
- Rail/sidebar UX redesign (v0.8.20): unified glyphs, app menu, profile badges
- Developer Preview labelling (v0.8.34): README, connect banner, workspace strip, app menu, window title
- Performance work (v0.8.10–v0.8.11): `runtime.get` poll split, Azure deferred inventory, parallel enrichers, code splitting, table virtualisation
- AWS deferred inventory (v0.8.23, PR #69): `aws.inventory.get` RPC
- Per-action capabilities (v0.8.23, PRs #71–#73)
- App.tsx decomposition Steps 4a–4d (v0.8.23–v0.8.24, PRs #74–#77); action hooks (v0.8.25, PR #78); further shell trim (~1,548 lines)
- **F-028** desktop providers: `AwsActionsProvider`, `AzureActionsProvider`, `WorkspaceNavigationProvider`, `WorkspaceSessionProvider`, `RuntimeEmulatorProvider`, `AwsActionStatusProvider`, `AzureActionStatusProvider` (slices 1–7; Azure loading flags on action-status context)
- TanStack Query narrow pilot (v0.8.28, PR #84): `runtime.get` poll + `deployments.list`
- Developer Toolbox (v0.8.28, PR #83)
- Service enablement Phases 1–3 (v0.8.27, PR #82)
- Shared `ResourceInventoryShell` + `ResourceTable` across all AWS inventory tabs and Azure Storage
- Multi-platform CI and release builds (Windows, macOS, Linux) with SBOM + provenance on tags
- Vendor-neutral chaos labs with Docker pause/unpause, per-step capability
  reasons, automatic cleanup, and daemon restart recovery
- **F-029** application domain extraction: `runtime`, `deployment`, `sessionport`, `app/aws`, `app/azure`, `app/labs` (Phases 0–6c; check registry + invoke-write dispatch in labs domain)

### AWS (live)

Eighteen service tabs: S3, EC2, Lambda, DynamoDB, SQS, SNS, RDS, ECS, API Gateway, Secrets Manager, IAM, CloudWatch Logs, EKS, CloudFormation, EventBridge, Route 53, ELBv2, KMS.

Write operations (LocalStack / local endpoints only unless noted; Phases 1–3 shipped):

| Service | Operations |
|---------|------------|
| S3 | Upload, delete object, create bucket, **copy object**, **create folder prefix** |
| EC2 | Start, stop, reboot, run, terminate |
| Lambda | Invoke, create, delete |
| SQS | Peek, send, create queue, **purge queue** |
| SNS | Publish, create topic, **create subscription** |
| DynamoDB | Put item, delete item, **sample scan load more** |
| RDS | Start, stop, **reboot** instance |
| ECS | **Force new deployment**, **update desired count (scale)** |
| Logs | Create log group, put log events, **filter/search events** |
| IAM | Create role |

### Azure (live)

Eleven service tabs plus four operational tools (15 Azure nav entries).

Storage depth workflows: **blob copy**, **folder prefix create**, and **signed read SAS** (write-gated where applicable).

Recent highlights: WAF workbench, Log Analytics, PostgreSQL Flexible Server start/stop, storage queue purge, Front Door cache purge, Cosmos delete item, Bastion list/connect (cloud CLI), floci-az OpenTofu contract. Azure inventory/selection/writes/Bastion extracted to `internal/app/azure` (F-029 Phases 5a–5e).

### GCP (live via gcloud CLI)

Four live service tabs (no longer Soon-only):

| Service | Operations |
|---------|------------|
| Cloud Storage | List buckets/objects, prefix nav, upload/delete, **signed read URL** |
| Compute Engine | List VMs, **start/stop** |
| Cloud Functions | List (1st + 2nd gen), select, **invoke** |
| GKE | List clusters, **select cluster + list node pools** |

Write mutations gated by per-session `gcpWriteModeEnabled`. Profile discovery and overview remain available.

---

## Pre-v0.9 backlog (completed)

| Item | Status |
|------|--------|
| Step 5: ResourceTable for CloudFormation + EventBridge | Done |
| Step 6: S3 copy + folder prefix; Azure blob copy + folder prefix | Done |
| AWS write ops Phases 2–3 RPC routing in `service.go` | Fixed |
| floci-ui Steps 1–5 execution targets | Done |

---

## Architecture residual

F-028 desktop providers and F-029 daemon domain extraction for the planned phases are **complete** on `dev` (through F-028 slice 7 and F-029 Phase 6c). Remaining items are product polish, not blocked architecture:

| Item | Notes |
|------|--------|
| Azure Bastion UX | Optional polish only; cloud CLI `az network bastion` dependency is intentional |
| Live multi-cloud smoke | Manual against real AWS/Azure/GCP profiles after installers |

---

## Not done (deferred or external)

| Item | Target |
|------|--------|
| Cosmos SQL query panel (Step 6 remainder) | Post-v0.9 polish |
| Broader AWS write ops on inventory-only tabs (API GW, CFN, etc.) | Low priority; inventory-first by design |
| Service enablement Phase 4 onboarding wizard | v0.9.x polish |
| Deeper GCP workspace (IAM, more mutations, SDK path) | v0.10 decision |
| Legacy AWS: Who Am I, SSO login/logout UI, open-config folder | Breadth vs polish |
| Performance Phase 4 (partial snapshots, push events) | v0.10 stabilisation |
| Release signing + auto-update | v1.0 |
| Hosted recipe registry | v2.0 |
| floci-az official Postgres image | External; local build works |

---

## Key references

| Document | Scope |
|----------|-------|
| `local/plans/V0.9-V1.0-PLAN.md` | Recipes + labs arc |
| `local/checkpoint.md` | Session resume log (gitignored) |
| `docs/floci-ui-inspiration.md` | Steps 1–6 execution order |
| `docs/aws-services-expansion-plan.md` | AWS tabs |
| `docs/aws-write-operations-plan.md` | AWS write RPC phases |
| `docs/service-enablement-plan.md` | Provider/service toggles |
| `CHANGELOG.md` | User-facing release notes |

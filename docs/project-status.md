# CloudSprocket project status

**Last updated:** 1 August 2026

**Latest release:** [v0.9.12](https://github.com/Ali-Shaikh/cloud-sprocket/releases/tag/v0.9.12)
**Recent releases:** v0.8.33 (write mode for all profiles, inventory layout), v0.8.32 (Route 53, ELBv2, KMS), v0.8.31 (CloudFormation, EventBridge, write ops Phases 2–3)

CloudSprocket is a local-first desktop cloud workbench: React + TypeScript + Tauri v2 + Go sidecar. The PySide6 legacy app was removed in PR #67. The Tauri rewrite is the active product. The app is labelled **Developer Preview** (not production-ready).

---

## Done

### Core platform

- Tauri v2 desktop shell with Go JSON-RPC sidecar
- Multi-cloud profile discovery (AWS, Azure, GCP config visibility)
- Session/workspace model, SQLite persistence, write-mode gating for local endpoints
- Local Runtime tab: Docker, LocalStack, floci-az emulator management
- OpenTofu deploy engine with 23 bundled recipes (AWS + Azure)
- Rail/sidebar UX redesign (v0.8.20): unified glyphs, app menu, profile badges
- Developer Preview labelling (v0.8.34): README, connect banner, workspace strip, app menu, window title
- Performance work (v0.8.10–v0.8.11): `runtime.get` poll split, Azure deferred inventory, parallel enrichers, code splitting, table virtualisation
- AWS deferred inventory (v0.8.23, PR #69): `aws.inventory.get` RPC
- Overview polish (v0.8.23, PR #70): runtime health strip; GCP nav Soon badges
- Per-action capabilities (v0.8.23, PRs #71–#73)
- App.tsx decomposition Steps 4a–4d (v0.8.23–v0.8.24, PRs #74–#77); action hooks (v0.8.25, PR #78); further shell trim (~1,548 lines)
- TanStack Query narrow pilot (v0.8.28, PR #84): `runtime.get` poll + `deployments.list`
- Developer Toolbox (v0.8.28, PR #83)
- Service enablement Phases 1–3 (v0.8.27, PR #82)
- Shared `ResourceInventoryShell` + `ResourceTable` across all AWS inventory tabs and Azure Storage (Step 5 complete, including CloudFormation and EventBridge)
- Multi-platform CI and release builds (Windows, macOS, Linux)
- Vendor-neutral chaos labs with Docker pause/unpause, per-step capability
  reasons, automatic cleanup, and daemon restart recovery

### AWS (live)

Eighteen service tabs: S3, EC2, Lambda, DynamoDB, SQS, SNS, RDS, ECS, API Gateway, Secrets Manager, IAM, CloudWatch Logs, EKS, CloudFormation, EventBridge, Route 53, ELBv2, KMS.

Write operations (LocalStack / local endpoints only; Phases 1–3 shipped, RPC routing fixed pre-v0.9):

| Service | Operations |
|---------|------------|
| S3 | Upload, delete object, create bucket, **copy object**, **create folder prefix** |
| EC2 | Start, stop, reboot, run, terminate |
| Lambda | Invoke, create, delete |
| SQS | Peek, send, create queue |
| SNS | Publish, create topic |
| DynamoDB | Put item, delete item |
| RDS | Start, stop instance |
| Logs | Create log group, put log events |
| IAM | Create role |

### Azure (live)

Eleven service tabs plus four operational tools (15 Azure nav entries).

Storage depth workflows (Step 6 partial): **blob copy** and **folder prefix create** on Azure Storage (write-gated).

Recent highlights: WAF workbench, Log Analytics, PostgreSQL Flexible Server, floci-az OpenTofu contract, Docker socket mount for real Postgres containers.

### GCP

Profile discovery and overview tab only. Nav entries show explicit Soon badges.

---

## Pre-v0.9 backlog (completed on `feat/pre-v09-backlog`)

| Item | Status |
|------|--------|
| Step 5: ResourceTable for CloudFormation + EventBridge | Done |
| Step 6: S3 copy + folder prefix; Azure blob copy + folder prefix | Done |
| AWS write ops Phases 2–3 RPC routing in `service.go` | Fixed (handlers existed but were not registered) |
| floci-ui Steps 1–5 execution targets | Done |

---

## Ready for v0.9

With the pre-v0.9 backlog closed, the next arc is the **recipes + labs platform** per `local/plans/V0.9-V1.0-PLAN.md`:

1. Phase 0 UX audit
2. v0.9.0: labs engine + runner + deploy refactor
3. v0.9.1–v0.9.4: lab waves, drift, update flow, import/validate, policy, onboarding wizard

---

## Not done (deferred past v0.9 or external)

| Item | Target |
|------|--------|
| Cosmos SQL query panel (Step 6 remainder) | Post-v0.9 polish or v0.9.x if prioritised |
| AWS write ops for expanded inventory-only tabs (ECS, API GW, CFN, etc.) | Low priority; inventory-first by design |
| Service enablement Phase 4 onboarding wizard | v0.9.4 |
| GCP workspace | v0.10 decision point |
| Legacy AWS: Who Am I, SSO login/logout UI, open-config folder | Breadth vs polish |
| Performance Phase 4 (partial snapshots, push events) | v0.10 stabilisation |
| Release signing + auto-update | v1.0 |
| Hosted recipe registry | v2.0 |
| floci-az official Postgres image | External; local build works |

---

## Key references

| Document | Scope |
|----------|-------|
| `local/plans/V0.9-V1.0-PLAN.md` | Recipes + labs arc (next) |
| `local/checkpoint.md` | Session resume log |
| `docs/floci-ui-inspiration.md` | Steps 1–6 execution order |
| `docs/aws-services-expansion-plan.md` | AWS tabs (complete) |
| `docs/aws-write-operations-plan.md` | AWS write RPC phases |
| `docs/service-enablement-plan.md` | Provider/service toggles |# Post merge notes

Phased process completed for fixes.


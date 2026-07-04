# CloudSprocket project status

**Last updated:** 5 July 2026 (v0.8.27 released, `dev` clean)  
**Latest release:** [v0.8.27](https://github.com/Ali-Shaikh/cloud-sprocket/releases/tag/v0.8.27)  
**Recent releases:** v0.8.25 (App.tsx action hooks #78, ECS #79, API Gateway #80), v0.8.26 (Secrets Manager #81), v0.8.27 (service enablement Phases 1–3, PR #82)

CloudSprocket is a local-first desktop cloud workbench: React + TypeScript + Tauri v2 + Go sidecar. The PySide6 legacy app was removed in PR #67. The Tauri rewrite is the active product.

---

## Done

### Core platform

- Tauri v2 desktop shell with Go JSON-RPC sidecar
- Multi-cloud profile discovery (AWS, Azure, GCP config visibility)
- Session/workspace model, SQLite persistence, write-mode gating for local endpoints
- Local Runtime tab: Docker, LocalStack, floci-az emulator management
- OpenTofu deploy engine with 23 bundled recipes (AWS + Azure)
- Rail/sidebar UX redesign (v0.8.20): unified glyphs, app menu, profile badges
- App icon refresh committed (`c6a088d`, 3 July 2026): master logo in `design/brand/`, all Tauri icon sizes regenerated
- Performance work (v0.8.10–0.8.11): `runtime.get` poll split, Azure deferred inventory, parallel enrichers, code splitting, table virtualisation
- AWS deferred inventory (v0.8.23, PR #69): `aws.inventory.get` RPC; workspace open loads S3 + EC2 only; other tabs fetch on first activation
- Overview polish (v0.8.23, PR #70): runtime health strip on Overview; GCP nav Soon badges for upcoming services
- Per-action capabilities (v0.8.23, PRs #71–#73): `ActionCapability` model in Go, `actionCapabilities` on workspace snapshots, all AWS write buttons plus Azure core views and Azure tools (App Service, WAF, Front Door) gated with disabled reasons via `lib/action-capabilities.ts`
- App.tsx decomposition Steps 4a–4d (v0.8.23–v0.8.24, PRs #74–#77): snapshot/shell helpers, `useSessionState` / `useWorkspaceState` / `useVirtualisationPoll` hooks, IPC-boundary snapshot normalisation (also completes perf plan Phase 3c), per-provider tab routers (`components/workspace/`). `App.tsx` 4,893 → 2,891 lines
- App.tsx action hooks (v0.8.25, PR #78): `use-aws-actions`, `use-azure-actions`, `use-runtime-actions`; `App.tsx` now ~1,964 lines
- AWS expansion Phase 2 (v0.8.25–v0.8.26, PRs #79–#81): ECS, API Gateway, Secrets Manager tabs
- Service enablement Phases 1–3 (v0.8.27, PR #82): service catalogue, `preferences.json`, Services settings page (App menu), tab/enricher/provider filtering, Overview hidden-resources hint. See `docs/service-enablement-plan.md`. Phase 4 (onboarding wizard) deferred
- Multi-platform CI and release builds (Windows, macOS, Linux)

### AWS (live)

Twelve service tabs: S3, EC2, Lambda, DynamoDB, SQS, SNS, RDS, ECS, API Gateway, Secrets Manager, IAM, CloudWatch Logs.

Write operations (LocalStack / local endpoints only; Phase 1 shipped):

| Service | Operations |
|---------|------------|
| S3 | Upload object |
| EC2 | Start, stop, reboot |
| Lambda | Invoke, create |
| SQS | Peek, send message, create queue |
| SNS | Publish, create topic |
| DynamoDB | Put item, delete item |

### Azure (live)

Eleven service tabs: Azure overview, Resource Groups, VMs, Storage, App Service, Functions, Key Vault, Cosmos DB, PostgreSQL, Queues, Entra ID.

Four operational tools: WAF Security, Log Analytics, Front Door, Tools hub. (15 Azure nav entries in total; see the tab label map in `apps/desktop/src/App.tsx`.)

Recent highlights:

- WAF security workbench (v0.8.18)
- Log Analytics + Front Door query fixes (v0.8.19)
- App Service full setting value view + sensitive reveal (v0.8.19)
- PostgreSQL Flexible Server tab + `lab-postgres-flexible-azure` recipe (v0.8.21)
- floci-az OpenTofu compatibility contract + Windows TLS trust fix
- Docker socket mount for floci-az (real Postgres containers)

### GCP

- Profile discovery and overview tab (config visibility only)
- No service inventory or workspace operations

---

## In progress / local WIP

### floci-az Postgres image

Code and socket-mount fix are on `dev`. End-to-end Postgres deploy works with a local `floci/floci-az:pg-local` build. Waiting on an official floci-az release that includes Postgres (PR #80 merged 27 Jun; published image is still 0.8.0 without Postgres).

---

## Not done

### GCP workspace

Full provider support beyond discovery/overview. Product positioning: AWS and Azure live; GCP coming later.

### Legacy AWS conveniences (not ported from PySide6)

- Who Am I
- SSO login/logout from the UI
- Open-config folder action

(SSO metadata is detected; the login flow is not wired up.)

### AWS service expansion

See `docs/aws-services-expansion-plan.md`.

- Phase 1 (deferred inventory): **shipped in v0.8.23** (PR #69)
- Phase 2: **shipped in v0.8.25–v0.8.26** (ECS #79, API Gateway #80, Secrets Manager #81)
- Phase 3+ not started: EKS, CloudFormation, EventBridge, Route 53, ELB, KMS

### AWS write operations (Phase 2+)

See `docs/aws-write-operations-plan.md`. Phase 1 done. Outstanding:

- Phase 2: S3 delete/create bucket, EC2 run/terminate, Lambda delete
- Phase 3: RDS start/stop, Logs create/put, IAM create role
- Phase 4: writes for expanded services

### Performance / architecture (deferred)

See `docs/performance-remediation-plan.md`. Phases 1a-1d, 2a-2c, 3a and 3d shipped in v0.8.10; AWS deferred inventory shipped in v0.8.23 (#69); Phase 3c (IPC-boundary snapshot normalisation) shipped in v0.8.24 (#76). Remaining:

- Phase 3b: handler hooks shipped in v0.8.25 (#78); `App.tsx` is ~1,964 lines (exit criterion ~1,500 not met; remainder is genuine app-shell logic). This gates the TanStack Query decision
- Phase 2d: parallelise Azure phase-2 enrichers where safe (Queues, WAF, Front Door)
- Phase 4: IPC/API shape changes (partial snapshots, push events)
- WAF optional Azure Monitor metrics tiles

### Release signing

Releases are unsigned. Windows code signing and macOS notarisation not configured.

### Azure load performance Phase 2

Progressive snapshots and further phase-2 parallelisation deferred. See `docs/azure-load-performance-plan.md`.

---

## Open dependency PRs

Low urgency; mostly Renovate bumps.

| PR | Blocker |
|----|---------|
| #21 Vite 8.1.3 | pnpm minimum release age |
| #54 @tanstack/react-virtual | pnpm minimum release age |
| #56 Radix UI | pnpm minimum release age |
| #27 Go 1.26.4 | branch protection policy |
| #61–66 | Tailwind, AWS SDK JS, Lucide, Docker tags, etc. |

---

## Suggested priorities

Revised 5 July 2026 after v0.8.27 (Targets A–B and service enablement Phases 1–3 delivered):

1. TanStack Query decision (`docs/floci-ui-inspiration.md` Target C): pilot on idempotent reads only (`runtime.get`, logs, `deployments.list`), or explicitly decline
2. Step 5 shared inventory shell (`ResourceTable` + `ResourceInspector`, frontend only)
3. AWS expansion Phase 3: EKS, CloudFormation, EventBridge (`docs/aws-services-expansion-plan.md`)
4. Service enablement Phase 4: first-run onboarding wizard (thin skin over existing preferences; deferred from v0.8.27)
5. Re-test Postgres deploy when official floci-az ships Postgres (external blocker)
6. GCP workspace or legacy AWS SSO/Who Am I (breadth vs polish)

---

## Key references

| Document | Scope |
|----------|-------|
| `README.md` | Toolchain, getting started |
| `local/checkpoint.md` | Session resume log (local, gitignored content) |
| `docs/aws-services-expansion-plan.md` | New AWS tabs |
| `docs/aws-write-operations-plan.md` | AWS write RPC phases |
| `docs/performance-remediation-plan.md` | Performance phases |
| `docs/azure-load-performance-plan.md` | Azure load optimisations |
| `docs/waf-security-workbench.md` | WAF tool design |
| `docs/azure-postgresql-flexible-server-plan.md` | Postgres feature (shipped v0.8.21) |
| `docs/floci-ui-inspiration.md` | Patterns from floci-io/floci-ui |
| `docs/service-enablement-plan.md` | Provider/service toggles (Phases 1–3 shipped v0.8.27) |
# CloudSprocket project status

**Last updated:** 4 July 2026 (PR #69 open; Step 1 implementation complete, awaiting review)  
**Current version:** v0.8.22 (`dev`; v0.8.22 tag exists; deferred inventory lands in next release after #69 merges)
**Latest release:** [v0.8.21](https://github.com/Ali-Shaikh/cloud-sprocket/releases/tag/v0.8.21)

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
- Multi-platform CI and release builds (Windows, macOS, Linux)

### AWS (live)

Nine service tabs: S3, EC2, Lambda, DynamoDB, SQS, SNS, RDS, IAM, CloudWatch Logs.

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

### AWS deferred inventory (Step 1)

**PR #69** (`feat/aws-deferred-inventory` → `dev`): `aws.inventory.get` RPC + `awsDeferredInventory` on workspace open. Implementation complete; awaiting Greptile review and CI. Do not merge until approved. After merge, continue with Step 2 (Overview polish) and AWS expansion Phase 2 (ECS, API Gateway, Secrets Manager).

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

- Phase 1 (deferred inventory): **in PR #69**, awaiting review
- Phase 2+ not started: ECS, API Gateway, Secrets Manager, EKS, CloudFormation, EventBridge, Route 53, ELB, KMS

### AWS write operations (Phase 2+)

See `docs/aws-write-operations-plan.md`. Phase 1 done. Outstanding:

- Phase 2: S3 delete/create bucket, EC2 run/terminate, Lambda delete
- Phase 3: RDS start/stop, Logs create/put, IAM create role
- Phase 4: writes for expanded services

### Performance / architecture (deferred)

See `docs/performance-remediation-plan.md`. Phases 1a-1d, 2a-2c, 3a and 3d shipped in v0.8.10; `awsScope` is live on every AWS selection handler (`aws_s3.go`, `aws_ec2.go`, `aws_lambda.go`, `aws_dynamodb.go`, `aws_sqs.go`, `aws_breadth.go`). Remaining:

- Phase 2d: parallelise Azure phase-2 enrichers where safe (Queues, WAF, Front Door)
- Phase 3b: decompose `App.tsx` (now ~4,900 lines; prerequisite for any TanStack Query adoption)
- Phase 3c: normalise workspace snapshots once at the IPC boundary instead of at each call site
- Phase 4: IPC/API shape changes (partial snapshots, push events)
- AWS deferred inventory: **in PR #69** (`feat/aws-deferred-inventory`); on `dev` today, `workspace.get` still runs all nine enrichers until #69 merges
- WAF optional Azure Monitor metrics tiles

### Release signing

Releases are unsigned. Windows code signing and macOS notarisation not configured.

### Azure load performance Phase 2

Progressive snapshots and further phase-2 parallelisation deferred. See `docs/azure-load-performance-plan.md`.

---

## Open PRs

| PR | Scope | Status |
|----|-------|--------|
| **#69** | AWS deferred inventory (`aws.inventory.get` + tab-scoped fetch) | Awaiting Greptile review + CI |

### Open dependency PRs

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

Revised 4 July 2026 after PR #69 opened:

1. **Merge PR #69** after Greptile review + CI (squash to `dev`; bump version post-merge)
2. Overview polish (Step 2): runtime health strip, service-card click-through, GCP "Soon" badges
3. Per-action capability metadata (Step 3): unify write-mode, profile capability and runtime-reachability gates
4. AWS expansion Phase 2: ECS, API Gateway, Secrets Manager tabs (stacked PRs on `dev`)
5. Re-test Postgres deploy when official floci-az ships Postgres (external blocker)
6. `App.tsx` decomposition (perf plan Phase 3b), then decide on TanStack Query adoption
7. GCP workspace or legacy AWS SSO/Who Am I (breadth vs polish)

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
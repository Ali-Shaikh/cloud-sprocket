# CloudSprocket Roadmap

_Last updated: 2026-06-14. Living document — refine freely._

## North star

CloudSprocket is the **local-first cloud workbench for developers**: one desktop app that unifies
(a) multi-cloud **inventory & control**, (b) **local emulators** (LocalStack / floci-az), and
(c) self-service **IaC recipe deployment** (OpenTofu). The defining loop:

> **Build and test infrastructure + app against local emulators, then ship the _same recipe_ to
> real cloud by switching a connection profile.**

**Strategic steer:** lean into the **IaC recipe engine + LocalStack "superpowers"** as the spine.
Inventory is supporting cast — enough to verify what you deployed, mirror prod down to local, and
act on resources. We do **not** try to be a generic multi-cloud console (that loses to the
first-party AWS/Azure consoles).

Competitive context: Massdriver / Nullstone / Spacelift / env0 are team-hosted SaaS; Backstage is a
framework; the cloud consoles are single-cloud and have no local story. None is a **desktop,
local-first, multi-cloud, recipe-driven** workbench with a tight local→cloud loop.

## Where we are (shipped)

- Tauri v2 + React 19 + Tailwind/shadcn desktop app with a Go sidecar daemon.
- Multi-cloud inventory/control: AWS (S3, EC2), Azure (resource groups, VMs); provider/profile
  discovery + auth; read/write safety (`awsWritesEnabled`).
- Local emulators: LocalStack (AWS) + floci-az (Azure), managed via Docker; floci-az ARM inventory.
- IaC recipes: OpenTofu engine (download/verify/run), recipe model + manifest loader, deploy
  lifecycle (plan/apply/destroy), 2 bundled recipes (serverless + container), generated forms,
  deployments registry, local dry-run, LocalStack-reachable output URLs.
- Notifications, activity log, debug console, app reset.

---

## Themes

### A. Recipe platform
- **Recipe registry (npm-like):** browse / install / version / publish; signed & trusted recipes.
  Git-backed or simple HTTP first. (Manifest is already registry-ready.)
- **Authoring wizard + validation:** "New recipe", lint, dry-run, import from folder/git/zip.
- **Drift detection + update flow:** re-`plan` an applied deployment, show drift, redeploy with
  changed vars.
- **Cost estimate:** Infracost on the plan diff ("what will this cost?" before apply).
- **Policy guardrails:** OPA / Conftest gate before apply.
- **Remote state + locking:** S3 / azurerm backends; import existing resources.
- **More bundled recipes:** static site, scheduled job (EventBridge+Lambda), queue worker, data
  pipeline; Azure (Static Web App + Functions + Cosmos).
- **Live-streamed build logs** (currently buffered).

### B. LocalStack superpowers (key differentiator)
- **Cloud Pods:** save / restore / share snapshots of the local stack; seed deployments; share
  reproducible envs. <https://docs.localstack.cloud/aws/capabilities/state-management/cloud-pods/>
- **IAM Policy Stream → least-privilege generator:** run locally, capture required IAM actions,
  generate a tight policy, offer to bake it into the recipe.
  <https://docs.localstack.cloud/aws/capabilities/security-testing/iam-policy-stream/>
- **Chaos engineering panel:** inject latency / 500s / Service Unavailable / region outage against
  the local stack or a deployed recipe.
  <https://docs.localstack.cloud/aws/capabilities/chaos-engineering/chaos-engineering-dashboard/>
- **AWS replicator:** "Mirror from cloud" — copy real resources into LocalStack to reproduce prod.
- **App Inspector:** visualise local resources + request flow.
- **Embedded assistant:** the LocalStack MCP is wired (`.mcp.json`); an in-app "Ask/Fix" that
  analyses logs and suggests fixes.

### C. Cloud breadth (supporting)
More AWS services in inventory/control (Lambda, RDS, DynamoDB, SQS/SNS, IAM, CloudWatch logs),
Azure depth (storage, functions, SQL), GCP. Unified cross-provider resource search. Kept lean.

### D. App quality & DX
⌘K command palette (deferred from the UI rebuild), first-run onboarding (detect Docker, offer to
install LocalStack/tofu, guided sample deploy), auto-update (Tauri updater) + signed cross-platform
builds (mac/Linux) via a CI release pipeline, a proper Settings screen (tokens, paths, registry),
accessibility pass, perf (cache Docker reachability to kill poll churn).

### E. Reliability & security
- **Encrypt sensitive vars/outputs at rest** — currently persisted as plaintext in the deployments
  JSON. Use the OS keychain via Tauri; redact from logs.
- **Bounded timeouts everywhere** — floci-az ARM calls in `workspace.get` use `context.Background()`
  and can hang the snapshot. Add deadlines + a blocking-server regression test.
- **Job queue + per-deployment locks** — no concurrent `apply` on the same workspace.
- **CI test matrix** (Win/mac/Linux) + gated live tests against a LocalStack service.

---

## Release plan

| Release | Focus | Headline items |
|---|---|---|
| **v0.3 (quick wins)** | polish + security | live build logs · encrypt secrets · ⌘K palette · floci timeout fix · poll-churn · +2 recipes |
| **v0.4** | LocalStack superpowers | Cloud Pods · IAM policy generator · Chaos panel |
| **v0.5** | recipe platform | registry (browse/install/publish) · authoring wizard · drift/update · cost (Infracost) · policy (OPA) |
| **v0.6** | breadth | AWS replicator · more AWS/Azure services · App Inspector |
| **v1.0** | productionise | signed cross-platform builds · auto-update · onboarding · hardening · test matrix |

---

## v0.3 — Quick wins (current focus)

Small, high-value, low-risk. Each ships independently behind a PR into `dev`.

1. **Encrypt sensitive deployment values (security).** Sensitive recipe variables and Terraform
   outputs are persisted in plaintext in the SQLite deployments payload. Store them via the OS
   keychain (Tauri `keyring`/secure-store) or encrypt at rest with an app key; mask in the UI
   (already done) and redact from logs/debug console. _Files: `internal/deploy`, `internal/store`,
   `apps/desktop` outputs._

2. **Live-streamed build logs.** `runBuildSteps` buffers `npm ci` output and emits it after the
   command finishes; stream line-by-line via the same `deployment.log` event the tofu runner uses.
   _Files: `internal/deploy/deploy.go` (use a streaming writer like the tofu runner)._

3. **⌘K command palette.** Deferred from the UI rebuild. Fuzzy navigate (connections, tabs,
   recipes, deployments) + quick actions (refresh, open recipe, start/stop emulator). _Files:
   `apps/desktop` shell._

4. **floci-az `workspace.get` timeout.** Local Azure inventory calls use `context.Background()`;
   add a bounded `context.WithTimeout` and a blocking-server regression test so a stalled ARM pager
   can't hang the workspace snapshot. _Files: `internal/app/service.go`, `internal/azureadapter`._

5. **Poll-churn reduction.** Cache Docker reachability briefly so each Local Runtime poll doesn't
   pay a ~3s probe when Docker is off. _Files: `internal/app/service.go` / `internal/dockerruntime`._

6. **Two more recipes.** `static-site-aws` (S3 + CloudFront, free-tier-friendly) and
   `scheduled-job-aws` (EventBridge schedule + Lambda) to prove platform breadth. _Files:
   `internal/recipes/bundled/`._

**Acceptance per item:** `go test ./...`, `pnpm run typecheck:desktop`, `pnpm --dir apps/desktop
test`, and `pnpm run build:desktop:exe` green; verified in the browser preview where UI-visible.

---

## Open decisions / risks

- **Secret storage mechanism:** OS keychain (per-user, no portability) vs app-managed encryption
  key (portable but key-management burden). Lean keychain for v0.3.
- **Registry hosting (v0.5):** Git-backed (simple, free, leverages GitHub) vs a dedicated service.
  Start Git-backed.
- **Arbitrary code execution:** recipe `build` steps and provider plugins run real code. Bundled
  recipes are trusted; imported/registry recipes need sandboxing + explicit consent before v0.5.
- **LocalStack Pro dependency:** Cloud Pods / Chaos / IAM Stream / replicator are Pro-tier. Gate
  those features behind a detected Pro token (the app already collects one); degrade gracefully.
- **Scope creep:** resist becoming a generic cloud console; every inventory addition should serve
  the local→cloud loop (verify / mirror / act).

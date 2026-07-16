# CloudSprocket

> **Developer Preview** — not production-ready. Expect breaking changes between
> releases. Use local emulators and non-critical accounts until v1.0.

CloudSprocket is a local-first desktop cloud workbench for browsing, operating, and
deploying against AWS and Azure from one workspace. The app pairs a **Tauri v2**
shell (`React`, `TypeScript`) with a **Go** sidecar daemon that handles discovery,
inventory, JSON-RPC, and SQLite-backed session state.

**Latest release:** [v0.9.7](https://github.com/Ali-Shaikh/cloud-sprocket/releases/latest)

## Developer Preview

CloudSprocket is actively evolving toward v1.0. Builds are intended for evaluation
and local development, not production operations:

- Behaviour, workspace data formats, and RPC contracts may change without a major
  version bump while the app remains on `0.x`.
- Write mode can target live cloud accounts; treat that as opt-in and high risk.
- Prefer LocalStack, floci-az, and disposable profiles when experimenting.

Feedback and issues are welcome on [GitHub](https://github.com/Ali-Shaikh/cloud-sprocket/issues).

## What you get

- **Multi-cloud workspaces** — lock an AWS or Azure profile and work in scoped tabs
- **Read-first inventory** — browse resources with deferred loading so workspace open stays fast
- **Write mode** — opt-in mutating actions on supported services (local emulators or permitted cloud profiles)
- **Local runtime** — Docker diagnostics plus [LocalStack](https://localstack.cloud/) and [floci-az](https://github.com/floci/floci) emulators
- **Deploy recipes** — OpenTofu-backed templates for common AWS and Azure patterns
- **Cross-platform builds** — Windows (`.msi`), macOS (`.dmg`), Linux (`.AppImage` + `.deb`)

The original PySide6 application was archived in April 2026. A few legacy AWS session
conveniences (Who Am I, SSO login/logout from the UI, open-config folder) are not yet
reimplemented in the new actions surface.

## Feature matrix

Legend: **Browse** = inventory and detail views · **Write** = mutating actions (write mode + capable profile) · **Local** = supported on LocalStack or floci-az

### Workspace (all providers)

| Area | Browse | Write | Notes |
|------|:------:|:-----:|-------|
| Overview | Yes | — | Session health, provider context, quick actions |
| Activity | Yes | — | Job, log, and refresh history |
| Local Runtime | Yes | Yes | Docker engine, LocalStack, floci-az start/stop |
| Deploy | Yes | Yes | OpenTofu recipe catalogue and apply/destroy |

### AWS workspace tabs

| Tab | Service | Browse | Write | Local |
|-----|---------|:------:|:-----:|:-----:|
| S3 | Object storage | Yes | Upload, presign | LocalStack |
| EC2 | Compute | Yes | Start, stop, reboot | LocalStack |
| Lambda | Functions | Yes | Invoke, create | LocalStack |
| DynamoDB | NoSQL | Yes | Put, delete item | LocalStack |
| SQS | Queues | Yes | Peek, send, create queue | LocalStack |
| SNS | Topics | Yes | Publish, create topic | LocalStack |
| RDS | Databases | Yes | — | LocalStack |
| ECS | Containers | Yes | — | LocalStack |
| API Gateway | REST / HTTP APIs | Yes | — | LocalStack |
| Secrets | Secrets Manager | Yes | Reveal value | LocalStack |
| Logs | CloudWatch Logs | Yes | — | LocalStack |
| IAM | Roles and policies | Yes | — | Partial |

### Azure workspace tabs

| Tab | Service | Browse | Write | Local |
|-----|---------|:------:|:-----:|:-----:|
| Azure | Subscription context | Yes | — | floci-az |
| Resource Groups | Groups | Yes | Create, delete | floci-az |
| Virtual Machines | Compute | Yes | Start, stop, deallocate, restart | floci-az |
| Storage | Blob storage | Yes | Account, container, blob CRUD | floci-az |
| App Service | Web apps | Yes | Create, settings, slots, lifecycle | Cloud only |
| Functions | Function apps | Yes | Invoke | floci-az |
| Key Vault | Secrets | Yes | Set secret, reveal value | floci-az |
| Cosmos DB | NoSQL | Yes | — | floci-az |
| PostgreSQL | Flexible Server | Yes | — | floci-az |
| Queues | Storage queues | Yes | Peek messages | floci-az |
| Entra ID | Directory | Yes | — | Cloud only |
| WAF Security | Front Door WAF | Yes | Mode, rules, exclusions | Cloud |
| Log Analytics | KQL workbench | Yes | Run queries | floci-az / cloud |
| Front Door | CDN topology | Yes | Cache purge | Cloud |
| Tools | Investigation hub | Yes | — | Routes to WAF / LA / AFD |

### Planned

| Provider | Status |
|----------|--------|
| GCP | Overview shell plus Storage, Compute, Functions, and GKE tabs marked coming soon |

## Repository layout

| Path | Purpose |
|------|---------|
| `apps/desktop/` | Tauri shell, React UI, desktop bridge |
| `backend/daemon/` | Go sidecar, JSON-RPC handlers, discovery, SQLite store |
| `.github/workflows/` | Multi-platform CI and release pipeline |

## Toolchain

| Tool | Version |
|------|---------|
| Node.js | 24 (Active LTS) |
| pnpm | 11.9+ |
| Go | 1.26.5 |
| Rust | latest stable |

Linux builds also need Tauri's system packages. See the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/).

## Getting started

```powershell
pnpm install
pnpm run test
pnpm run build:desktop
```

For day-to-day UI development:

```powershell
pnpm run dev:desktop
```

The desktop package builds the Go sidecar into `apps/desktop/src-tauri/binaries/` before
the Tauri bundle step.

Pre-built installers are published on [GitHub Releases](https://github.com/Ali-Shaikh/cloud-sprocket/releases).

## Licence

CloudSprocket is licensed under the GNU Affero General Public License v3.0
(AGPL-3.0-or-later). See [`LICENSE`](LICENSE) and [`COPYRIGHT`](COPYRIGHT).

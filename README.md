# CloudSprocket

CloudSprocket is a local-first desktop cloud workbench built with `React`,
`TypeScript`, `Tauri v2`, and a `Go` sidecar backend.

## Current Status

The Tauri rewrite is the active product (currently **v0.8.21**):

- desktop shell in `apps/desktop/`
- Go sidecar daemon in `backend/daemon/`
- multi-platform CI and release builds for Windows, macOS, and Linux
- AWS and Azure workspace tabs, OpenTofu deploy recipes, and local emulators
  (LocalStack, floci-az)

The original PySide6 application was archived in April 2026 and removed from the
repository once the rewrite surpassed it in scope. A few legacy AWS session
conveniences (Who Am I, SSO login/logout from the UI, open-config folder) are
not yet reimplemented in the new actions surface.

## Repository Layout

- `apps/desktop/`: Tauri v2 desktop shell, React UI, and desktop bridge
- `backend/daemon/`: Go sidecar daemon, JSON-RPC handlers, discovery logic, and SQLite store
- `.github/workflows/`: CI for the multi-platform desktop pipeline

## Toolchain Baseline

- `Node 24` Active LTS
- `pnpm 10.17+`
- `Go 1.26.1`
- latest stable `Rust`

Tauri's Linux system packages are also required. See the official prerequisites:
[Tauri prerequisites](https://v2.tauri.app/start/prerequisites/).

## Getting Started

```powershell
pnpm install
pnpm run test
pnpm run build:desktop
```

The desktop package builds the Go sidecar into `apps/desktop/src-tauri/binaries/`
before invoking the Tauri bundle step.

## Licence

CloudSprocket is licensed under the GNU Affero General Public License v3.0
(AGPL-3.0-or-later). See [`LICENSE`](LICENSE) for the full text and
[`COPYRIGHT`](COPYRIGHT) for project-specific copyright and notice details.

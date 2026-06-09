# CloudSprocket

CloudSprocket is being rewritten as a local-first desktop app built with `React`,
`TypeScript`, `Cloudscape`, `Tauri v2`, and a `Go` sidecar backend.

## Current Status

The repository is now in the first rewrite slice:

- the previous PySide6 application has been archived to `legacy/pyside-v1/`
- the new desktop shell lives in `apps/desktop/`
- the new backend daemon lives in `backend/daemon/`
- the repo is moving to a Tauri build and test pipeline across Windows, macOS,
  and Linux

Parity with the archived Python app is still in progress. The current codebase
focuses on the new app shell, RPC bridge, persistence layer, and the first port
of provider discovery and session state.

## Repository Layout

- `apps/desktop/`: Tauri v2 desktop shell, React UI, and desktop bridge
- `backend/daemon/`: Go sidecar daemon, JSON-RPC handlers, discovery logic, and SQLite store
- `legacy/pyside-v1/`: archived PySide6 implementation kept for behaviour reference
- `.github/workflows/`: CI for the new multi-platform desktop pipeline

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

## Legacy Reference

The archived Python code remains available under `legacy/pyside-v1/` while the
rewrite reaches parity. It is no longer the active implementation path.

## Sponsors

[![Termius](docs/sponsors/termius-logo.svg)](https://termius.com/)

[Termius](https://termius.com/) provides a secure, reliable, and collaborative SSH client.

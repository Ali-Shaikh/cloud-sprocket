# CloudSprocket

> Archived on `2026-04-14` as the pre-rewrite PySide6 implementation. This
> directory is retained as a behaviour reference while the `React + Tauri + Go`
> rewrite reaches parity.

CloudSprocket by Ali Shaikh is a PySide6 desktop shell for local cloud profile
discovery, auth visibility, and AWS-first provider actions.

The scaffold is set up to run on Windows and macOS, with platform-aware config
and cloud profile discovery defaults.

## Project Layout

- `src/cloudsprocket/`: application package
- `src/cloudsprocket/ui/`: branded actionable desktop shell
- `src/cloudsprocket/services/`: discovery, controller, provider actions, and command execution
- `tests/`: pytest coverage for settings, discovery, provider actions, controller behavior, and the UI

## Quick Start

Use Python 3.13 or 3.14 for local development.

```powershell
python -m venv .venv
.venv\Scripts\python -m pip install --upgrade pip
.venv\Scripts\python -m pip install -e .[dev]
.venv\Scripts\python -m pytest
.venv\Scripts\python -m cloudsprocket
```

## Desktop Build

Install the optional build dependency group and run the packaged build command:

```powershell
.venv\Scripts\python -m pip install -e .[dev,build]
.venv\Scripts\cloudsprocket-build
```

The build uses PyInstaller 6.19.0 and writes platform-native artifacts into
`dist/`:

- Windows: `dist/CloudSprocket/CloudSprocket.exe`
- macOS: `dist/CloudSprocket.app`

GitHub Actions also runs the test suite and desktop build on both Windows and
macOS for pushes to `dev` and `main`, as well as pull requests.

## Scope Of The Scaffold

The current shell includes:

- a GPLv3-licensed repo setup
- a modular `src/` package layout
- a branded desktop main window with provider summary, profile selection, details, auth methods, actions, and activity logs
- auth/tooling probes for AWS, Azure, and GCP with AWS as the first fully actionable provider
- AWS actions for refresh, identity check, SSO login, logout, session activation, config opening, and export snippet copying
- profile discovery skeletons for AWS config files, Azure CLI profile cache, and
  gcloud named configurations
- a reproducible PyInstaller-based desktop build command
- platform-aware defaults for Windows and macOS local config directories
- tests covering the non-trivial pieces of the baseline

## Licence

CloudSprocket is licensed under the GNU Affero General Public License v3.0.
See [`LICENSE`](LICENSE) for the full text.
Project-specific copyright and notice details are in [`COPYRIGHT`](COPYRIGHT).

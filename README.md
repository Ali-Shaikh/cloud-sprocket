# CloudSprocket

CloudSprocket is a PySide6 desktop scaffold for building a local cloud profile
and authentication control surface.

The scaffold is set up to run on Windows and macOS, with platform-aware config
and cloud profile discovery defaults.

## Project Layout

- `src/cloudsprocket/`: application package
- `src/cloudsprocket/ui/`: PySide6 window shell
- `src/cloudsprocket/services/`: auth status and profile discovery services
- `tests/`: pytest coverage for settings, discovery, and the GUI shell

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

## Scope Of The Scaffold

The initial shell includes:

- an MIT-licensed repo setup
- a modular `src/` package layout
- a desktop main window with refreshable provider and profile views
- auth/tooling probes for AWS, Azure, and GCP
- profile discovery skeletons for AWS config files, Azure CLI profile cache, and
  gcloud named configurations
- a reproducible PyInstaller-based desktop build command
- platform-aware defaults for Windows and macOS local config directories
- tests covering the non-trivial pieces of the baseline

# Checkpoint

- Date: `2026-05-15`
- Branch: `feat/azure-workspace-foundation`
- Head: `eb689fc`
- Working tree: local changes present
- Status: Azure inventory branch pushed and PR opened; ready for review and local Windows testing

## Current State

- `CHECKPOINT.local.md` is the detailed local working log; this file stays compact as the shared resume point.
- Active branch rule: create a feature/bug branch first and do not commit directly to `dev`.
- Current branch checked out: `feat/azure-workspace-foundation`.
- Latest completed release work in history is `0.1.17`.

## Latest Verified State

- `pnpm --dir apps/desktop test` passed.
- `tsc --noEmit` passed from `apps/desktop`.
- `go -C backend/daemon test ./...` passed.
- `GOFLAGS=-buildvcs=false pnpm --dir apps/desktop build:desktop:exe` passed locally.
- `pnpm run typecheck:desktop` passed.
- `go -C backend/daemon test ./...` passed again after the CI follow-up edits.
- `pnpm run typecheck:desktop` passed again on `2026-05-15` after resuming.
- `go -C backend/daemon test ./...` passed after updating `modernc.org/sqlite` to `v1.50.1`.
- `pnpm --dir apps/desktop test` passed after active dependency updates, including the major Vite toolchain refresh.
- `pnpm run typecheck:desktop` passed after active dependency updates, including TypeScript `6.0.3`.
- `GOFLAGS=-buildvcs=false pnpm --dir apps/desktop build:desktop:exe` passed after Tauri `2.11.x`, Vite `8.0.13`, Vitest `4.1.6`, jsdom `29.1.1`, pnpm `11.1.2`, and direct `thiserror` `2` updates.
- `CI=true pnpm install --frozen-lockfile` passed after allowing the `esbuild` install script required by `pnpm` `11.1.2`.
- `pnpm run typecheck:desktop` passed on `feat/ui-shell-ia-refresh`.
- `pnpm --dir apps/desktop test` passed on `feat/ui-shell-ia-refresh`.
- `go -C backend/daemon test ./...` passed on `feat/ui-shell-ia-refresh`.
- `GOFLAGS=-buildvcs=false pnpm --dir apps/desktop build:desktop:exe` passed on `feat/ui-shell-ia-refresh` and refreshed the Windows verification executable.
- `pnpm run typecheck:desktop` passed on `feat/azure-workspace-foundation`.
- `go -C backend/daemon test ./...` passed on `feat/azure-workspace-foundation`.
- `GOFLAGS=-buildvcs=false pnpm --dir apps/desktop build:desktop:exe` passed on `feat/azure-workspace-foundation` and refreshed the Windows verification executable.
- `pnpm --dir apps/desktop test` passed after Azure Resource Groups and Virtual Machines views were completed.

## Open Notes

- Local release bundle build hit Windows Installer service validation limits in this sandbox at WiX `light.exe`.
- Earlier dependency PR CI failures traced back to the already-fixed Tauri RGBA icon issue, not the dependency bumps themselves.
- Remaining higher-value parity gaps versus the archived PySide app are provider actions such as AWS `Who Am I`, AWS SSO login/logout, config opening, export snippet copy, clearer discovery warnings, and fuller Azure/GCP action parity.
- Current active branch scope:
  - Branch: `feat/azure-workspace-foundation`
  - PR: `#18` `feat: add azure inventory workspace views`
  - Changes in this slice:
    - backend workspace tabs are now provider-aware instead of always exposing AWS tabs
    - locked Azure sessions now show `Overview`, `Azure`, `Resource Groups`, `Virtual Machines`, and `Activity`
    - locked Azure sessions no longer expose AWS-only `S3` and `EC2` tabs
    - added an Azure landing page showing subscription context, tenant, auth readiness, diagnostics, and roadmap notes
    - added read-only Azure Resource Groups inventory backed by Azure CLI discovery and resource cache fallback
    - added read-only Azure Virtual Machines inventory scoped to the selected resource group
    - added desktop coverage for the Azure locked-workspace path and Azure inventory views
  - Windows local test artefact:
    - `apps/desktop/src-tauri/target/release/cloudsprocket-desktop`
  - Suggested next step on this branch:
    - user reviews PR `#18` and tests the refreshed Windows verification executable
- Latest dependency refresh merged on `dev`:
  - Active app stack only; archived `legacy/pyside-v1/` dependency updates intentionally left out.
  - Applied low-risk active updates: Cloudscape patch updates, React `19.2.6`, Tauri JS and Rust `2.11.x`, tokio `1.52.3`, Vite `7.3.3`, and `modernc.org/sqlite` `v1.50.1`.
  - Applied major toolchain updates that verified cleanly: `@vitejs/plugin-react` `6.0.2`, `vite` `8.0.13`, `vitest` `4.1.6`, `jsdom` `29.1.1`, `typescript` `6.0.3`, and workspace `pnpm` `11.1.2`.
  - Updated direct Rust dependency `thiserror` from `1` to `2`; transitive `thiserror` `1` remains in the graph where required by upstream crates.
  - Added `pnpm-workspace.yaml` `allowBuilds.esbuild: true` so CI can install successfully with `pnpm` `11`.
- Files changed and not yet committed:
- `CHECKPOINT.md`
- `CHECKPOINT.local.md`
- Likely next step on resume:
  - Continue from `feat/azure-workspace-foundation` after PR review or local Windows feedback.

## Review Follow-up - 2026-05-15

- Checked out locally on `feat/azure-workspace-foundation` at `eb689fc`.
- Read this checkpoint before review.
- Review verification run locally:
  - `pnpm run typecheck:desktop` passed.
  - `go -C backend/daemon test ./...` passed.
  - `pnpm --dir apps/desktop test` passed, 11 tests.
- Review note:
  - Fixed before commit: removed the `az vm start` snippet from Azure VM Copy Actions so the foundation branch stays read-only.
  - Verification after fix: `pnpm run typecheck:desktop` passed; `pnpm --dir apps/desktop test` passed, 11 tests.

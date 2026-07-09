# Checkpoint

This file is a pointer for agents. The live resume log is kept locally and is not committed to git.

**Resume log:** [`local/checkpoint.md`](local/checkpoint.md)

**Local-only workspace layout:**

| Path | Purpose |
|------|---------|
| [`local/checkpoint.md`](local/checkpoint.md) | Session resume log (update the top section after each module) |
| [`local/design/`](local/design/) | UI prototypes, design plans, modularisation notes |
| [`local/plans/`](local/plans/) | Milestone and foundation plans |
| [`local/reviews/`](local/reviews/) | Review and Codex checkpoint notes |

The `local/` directory is committed empty (`.gitkeep` only). Everything else under `local/` is gitignored.

## PR-131 fix session (2026-07-09)
- Fixed feat(recipes) for static-site-aws (public access block + policy restored) and scheduled-job-aws (nodejs22.x).
- Restored removed tests in recipes_test.go and deploy_live_test.go for full coverage.
- Made backend/daemon tests and build green (fixed duplicate isNoOp, added CheckDrift stub).
- Created local/checkpoint.md (compact). All per instructions: British English, no em-dashes, up-to-date AWS runtime info used.
- Commits to follow on branch only.
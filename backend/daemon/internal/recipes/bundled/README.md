# Bundled recipes

Each folder here is one portable OpenTofu recipe shipped with CloudSprocket.

## Layout

- `recipe.yaml`: manifest (metadata, build phases, UI hints)
- `*.tf`: infrastructure module
- `sample-*`: zero-config demo code used when the user does not supply their own

## Manifest contract

| Field | Purpose |
|-------|---------|
| `kind` | `app-deploy` (full application) or `service-lab` (single-service try-out) |
| `providers` | Cloud providers the module targets (today: `aws`) |
| `local.runtimes` | Compatible local emulators (`id: localstack`, `id: docker-compose`, optional `requiresPro`) |
| `build` | Pre-plan steps (e.g. `npm ci`, `pip install`) |
| `imageBuild` | Container image pipeline before plan (ECS/Fargate recipes) |
| `postApply` | Post-apply steps with outputs injected as env vars (`database_url` → `DATABASE_URL`) |
| `outputs` | Mark `primary: true` on outputs the UI should surface and open |
| `lab.steps[].fault` | Optional local-runtime fault with a closed `kind`, target, and parameters |

Legacy manifest fields are normalised in `internal/recipes/normalize.go`; add new fields there when upgrading older shapes.

## Adding a recipe

1. Copy a similar bundled folder.
2. Give it a unique `id` and set `kind`, tags, and `local.runtimes`.
3. Add a `TOFU_LIVE` plan test in `internal/deploy/deploy_live_test.go`.
4. Bump counts in `internal/recipes/catalog_test.go` when the catalogue grows.
5. For labs, keep `superpowers` empty and `requiresPro` false where possible.

Chaos lab steps must degrade gracefully when the selected runtime does not
support their fault. See [`docs/labs-platform.md`](../../../../../docs/labs-platform.md)
for the supported kinds, recovery contract, and outage-check example.

## Runtime targeting

Recipes declare which local runtimes they support. The deploy engine resolves a `Target` from `(provider, local, runtimeId)` so new emulators register without engine edits.

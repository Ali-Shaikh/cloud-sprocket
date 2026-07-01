# Implementation plan: Azure Database for PostgreSQL (Flexible Server)

Target implementer: Grok. This plan adds CloudSprocket support for the new floci-az
service shipped in [floci-az PR #80](https://github.com/floci-io/floci-az/pull/80)
(merged 27 June 2026): `Microsoft.DBforPostgreSQL/flexibleServers`.

The deliverable has two parts:

1. A bundled OpenTofu recipe that provisions a flexible server and dry-runs against
   floci-az locally. **This part is already done** (see `lab-postgres-flexible-azure`
   under `backend/daemon/internal/recipes/bundled/`). Verify it; do not rebuild it.
2. A read-only **PostgreSQL workspace tab** that lists flexible servers and shows
   connection details, mirroring the existing Cosmos DB tab. This is the work below.

---

## 1. What floci-az PR #80 provides (the ARM contract)

- **Resource type:** `Microsoft.DBforPostgreSQL/flexibleServers`, API version `2025-08-01`.
- **ARM paths:**
  - `/subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.DBforPostgreSQL/flexibleServers/{name}`
  - `.../flexibleServers/{name}/databases/{db}`
  - `.../flexibleServers/{name}/firewallRules/{rule}`
  - `.../flexibleServers/{name}/configurations/{cfg}`
- **Server PUT body:** `location`, `sku.name`, `sku.tier`,
  `properties.administratorLogin`, `properties.administratorLoginPassword`,
  `properties.version`, `properties.storage.storageSizeGB`. Synchronous responses
  with `provisioningState=Succeeded`.
- **Data plane:** one `postgres:17-alpine` container per logical server, dynamic host
  port, direct TCP connectivity. Mocked mode available without Docker.
- **Convenience endpoint (floci-az only):**
  `GET /{account}-postgres/flexibleServers/{serverName}/connect` returns
  `{ server, host: "localhost", port, jdbcUrl, uri, psql, dotNet }`.
- **Local divergence:** FQDN is `localhost` (not `{name}.postgres.database.azure.com`);
  ships non-TLS with `sslmode=disable`.

Source of truth: `docs/services/postgresql.md` in the floci-az repo.

---

## 2. Architecture context (read these first)

The app already has a clean dual-path adapter pattern for managed Azure data
services. Copy it; do not invent a new one.

- **Adapter pattern to mirror:** `backend/daemon/internal/azureadapter/cosmos.go`.
  Each method branches on `isLocalFlociProfile(profile)`: floci-az local uses a
  direct HTTP/SDK call against `i.flociBaseURL()` / the local ARM endpoint; cloud
  uses the `az` CLI via `i.run(ctx, ...)`.
- **Local floci plumbing:** `backend/daemon/internal/azureadapter/flocilocal.go`
  (`isLocalFlociProfile`, `flociEndpoint`, `flociCloudConfig`, `flociArmOptions`,
  `flociStaticCredential`, `localFlociSubscriptionID`). The local subscription id is
  `00000000-0000-0000-0000-000000000001`; auth is a no-op static token over plain
  HTTP (`InsecureAllowCredentialWithHTTP: true`).
- **Inventory entry points:** `backend/daemon/internal/azureadapter/inventory.go`.
- **Workspace tab registration:** `backend/daemon/internal/app/workspace_tabs.go`
  (the Azure provider branch, around the `azure-cosmos` tab). Tabs use
  `Category: workspaceTabCategoryService`.
- **Service wiring / IPC:** `backend/daemon/internal/app/service.go` and
  `interfaces.go` (add the adapter method to the interface), plus the request
  handler the frontend calls. Trace how `ListCosmosAccounts` flows from
  `apps/desktop/src/lib/backend.ts` → IPC command → `service.go` → adapter.
- **Frontend view to mirror:** `apps/desktop/src/views/workspace/AzureCosmosView.tsx`
  and its lazy registration in `apps/desktop/src/views/workspace/lazy-views.tsx`.
- **Models:** `backend/daemon/internal/models/models.go` (add
  `AzurePostgresServer` etc. next to `AzureCosmosAccount`).

---

## 3. Backend: adapter (`azureadapter/postgres.go`)

Create `backend/daemon/internal/azureadapter/postgres.go` mirroring `cosmos.go`.

### Models (`models.go`)

```go
type AzurePostgresServer struct {
    Name              string
    ResourceGroup     string
    Location          string
    Version           string
    AdministratorLogin string
    SKU               string
    StorageMB         int
    ProvisioningState string
    FQDN              string
    // Local-only: populated from the floci-az /connect endpoint.
    LocalHost string
    LocalPort int
    Tags      []models.DetailField
}

type AzurePostgresConnection struct {
    Host    string
    Port    int
    JDBCUrl string
    URI     string
    Psql    string
    DotNet  string
}
```

### Methods

1. `ListPostgresServers(ctx, profile) ([]AzurePostgresServer, error)`
   - **Local:** use the armresources generic client (see `listLocalResourceGroups`
     in `flocilocal.go`) to GET
     `.../providers/Microsoft.DBforPostgreSQL/flexibleServers` across the
     subscription, or per resource group. Decode `location`, `sku.name`,
     `properties.{version,administratorLogin,storage.storageSizeGB,provisioningState,fullyQualifiedDomainName}`.
     Prefer the typed `armpostgresqlflexibleservers` SDK module if it is already a
     dependency; otherwise a generic ARM GET with a hand-rolled struct (cheaper, no
     new dep). Check `go.mod` before adding a dependency.
   - **Cloud:** `i.run(ctx, "postgres", "flexible-server", "list", "--subscription",
     profile.ProfileID, "--output", "json", "--only-show-errors")` and decode.
2. `GetPostgresConnection(ctx, profile, resourceGroup, serverName) (AzurePostgresConnection, error)`
   - **Local only** (cloud returns a "not available locally" style note or builds a
     standard TLS string): `GET {flociBaseURL}/{account}-postgres/flexibleServers/{serverName}/connect`
     and decode the JSON `{ host, port, jdbcUrl, uri, psql, dotNet }`. Confirm the
     `{account}` segment with floci-az docs (cosmos uses `devstoreaccount1-cosmos`;
     postgres likely uses `devstoreaccount1-postgres` or a per-server account).
3. Optionally `ListPostgresDatabases(ctx, profile, rg, serverName)` for a child list
   in the detail pane. Defer if it bloats the first cut.

Add the new methods to the adapter interface in
`backend/daemon/internal/app/interfaces.go` and wire them in `service.go`.

### Tests

Add `postgres_test.go` mirroring `cosmos`/`wafconfig_test.go`: a fake `CLIExecutor`
for the cloud path and an `httptest.Server` for the local `/connect` and ARM list
paths. Match the existing table-test style. CI runs `go test ./...` and a desktop
typecheck, so keep model JSON tags consistent with the frontend types.

---

## 4. Backend: workspace tab

In `backend/daemon/internal/app/workspace_tabs.go`, inside the `providerID == "azure"`
branch, add a tab next to `azure-cosmos`:

```go
{
    TabID:    "azure-postgres",
    Label:    "PostgreSQL",
    Summary:  "Azure Database for PostgreSQL Flexible Servers.",
    Detail:   "List flexible servers and reveal connection strings. Backed by floci-az containers on local; read-only on cloud.",
    Category: workspaceTabCategoryService,
},
```

Update the `workspace_tabs` test (`app/service_test.go` or the dedicated tabs test)
that asserts the Azure tab set.

---

## 5. Frontend

1. **Types** (`apps/desktop/src/types/backend.ts`): add `AzurePostgresServer` and
   `AzurePostgresConnection` matching the Go JSON exactly.
2. **Backend bridge** (`apps/desktop/src/lib/backend.ts`): add `listPostgresServers`
   and `getPostgresConnection` wrappers next to the Cosmos ones, using the same IPC
   command-name convention.
3. **View** (`apps/desktop/src/views/workspace/AzurePostgresView.tsx`): mirror
   `AzureCosmosView.tsx`. Left: server list (name, version, location, state, SKU).
   Right/detail: admin login, FQDN, and a **Connection** panel with the
   `psql` / URI / JDBC / .NET strings and copy buttons. On floci-az show host+port
   from `/connect`; show the `sslmode=disable` caveat. Reveal the password-bearing
   strings behind a "Reveal" control like the App Service settings View dialog
   (see `AzureAppServiceView.tsx`, added in v0.8.19).
4. **Lazy registration** (`apps/desktop/src/views/workspace/lazy-views.tsx`): register
   `azure-postgres` → `AzurePostgresView`.
5. **Tests**: add `AzurePostgresView.test.tsx` mirroring `AzureCosmosView` tests,
   plus update `App.test.tsx` fixtures only if it enumerates Azure service tabs.

---

## 6. Recipe (already implemented — verify only)

Directory: `backend/daemon/internal/recipes/bundled/lab-postgres-flexible-azure/`
(`recipe.yaml`, `main.tf`, `variables.tf`, `outputs.tf`). Recipes auto-register via
`//go:embed bundled` in `recipes/embed.go` — no code change needed.

Key points to confirm:
- `kind: service-lab`, `providers: [azure]`, `local.runtimes: [{ id: floci-az }]`.
- `main.tf` declares `provider "azurerm" { features {} }`. On a local deploy the
  daemon writes `cloudsprocket_floci_az_override.tf` (a `*_override.tf` file, which
  Terraform **merges** into the provider block) to redirect at floci-az — see
  `backend/daemon/internal/deploy/target_floci_az.go`. Do not add a second provider
  block.
- Uses `azurerm >= 4.0` (latest is 4.79.0, June 2026). Note 4.x uses
  `resource_provider_registrations = "none"`, which the override already sets.
- Resources kept to what floci-az emulates: resource group + flexible server +
  database + firewall rule. Do not add App Service / Redis (floci-az does not
  emulate those; that is why `magento-commerce-azure` has no local target).

Verification steps:
1. `cd backend/daemon && go test ./internal/recipes/...` — loader + normalize tests
   should still pass and discover the new recipe.
2. Start floci-az from Local Runtime, then deploy the recipe via the app's Deploy
   view against the local floci-az profile; confirm plan/apply/destroy succeed.
3. Confirm `terraform validate` style checks pass (the recipe compat test in
   `backend/daemon/internal/deploy/recipe_compat.go` exercises bundled recipes).

---

## 7. Sequencing for Grok

1. Backend models + adapter (`postgres.go`) + interface wiring + adapter tests.
2. Workspace tab + tab test.
3. Frontend types → backend bridge → view → lazy registration → view tests.
4. Run `cd backend/daemon && go test ./...` and `pnpm --filter desktop test` +
   typecheck until green.
5. Build the desktop exe (`pnpm run build:desktop:exe`) so Ali can test the new tab
   and recipe end to end.
6. Bump version (currently 0.8.20 → 0.8.21) in `package.json` per the release pattern.

## 8. Open questions to resolve against floci-az before coding the adapter

- Exact `{account}` segment for the `/connect` path (per-server vs single
  `devstoreaccount1-postgres`).
- Whether floci-az lists flexible servers through the generic ARM
  `resources list` surface or only under the typed provider path.
- Default container port behaviour and whether `/connect` is reachable in mocked
  (Docker-free) mode.

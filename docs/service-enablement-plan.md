# Service Enablement Plan

Status: Phases 1-3 shipped in v0.8.27 (PR #82); Phase 4 deferred
Owner: Ali
Mockup: `design/service-enablement-settings-mockup.html`

## Goal

Let the operator enable only the clouds and services they use every day. Two levels,
hierarchical:

- **Provider level** (AWS, Azure, GCP): master switch. A disabled provider is hidden
  from Connect, never discovered, never polled.
- **Service level** (S3, EC2, Lambda, ...): per-service switch beneath an enabled
  provider. A disabled service is fully dormant: no workspace tab, no nav item, no
  snapshot enrichment, no API calls, and its lazy view chunk is never imported.

This also lays the state model for a future first-run onboarding wizard, which becomes
a thin guided skin over the same preferences.

## Decisions (agreed 2026-07-05)

| Question | Decision |
| --- | --- |
| Granularity | Both levels, hierarchical (provider master switch + per-service toggles) |
| Meaning of disabled | Fully dormant: hidden, unpolled, chunk never loaded |
| Fresh-install default | Everything on (opt-out); wizard flips to guided opt-in later |
| Scope | Global app setting; per-workspace overrides possible later |
| Disabled services with existing resources | Subtle hint on Overview with one-click enable |

## Why a catalogue refactor comes first

Service identity is currently hard-coded in three places:

1. `backend/daemon/internal/app/workspace_tabs.go` hard-codes the tab list per provider.
2. `backend/daemon/internal/app/aws_enrichment.go` hard-codes the enricher fan-out that
   runs on every workspace snapshot.
3. `apps/desktop/src/views/workspace/lazy-views.tsx` plus the tab router map tabs to
   views on the frontend.

Unifying 1 and 2 behind a single **service catalogue** in the daemon means one filter
point covers everything: filtering the catalogue by preferences removes the tab (so the
frontend nav cleans itself up, since it derives from the tab list) and removes the
enricher (so no API calls happen). The frontend needs no per-service knowledge of
enablement at all.

## Data model

Persist **disabled** sets, not enabled sets. Absence of config means everything is on
(the agreed default), and services added in future releases appear enabled instead of
silently missing.

```json
{
  "disabledProviders": ["gcp"],
  "disabledServices": {
    "aws": ["rds", "ecs", "sns"]
  }
}
```

- Service IDs are the existing `tabId` values (`s3`, `ec2`, `lambda`, `dynamodb`,
  `sqs`, `sns`, `rds`, `ecs`, `apigateway`, `secrets`, `iam`, `logs`,
  `azure-storage`, ...). No new ID scheme.
- Stored as `preferences.json` in `Settings.ConfigDir` (alongside the existing config
  artefacts). Hand-editable, easy to reset, no schema migration burden.
- Tabs with category `workspace` (Overview, Local Runtime, Activity) are never
  toggleable; they are part of the shell.
- Tools (`tool` category) are toggleable the same way as services.

## Phases

### Phase 1: catalogue + preferences model (no visible change)

1. **Service catalogue** (`backend/daemon/internal/app/service_catalog.go`):
   one entry per service: `providerID`, `serviceID` (= tabId), label, summary, detail,
   category, and a reference to its enricher. Refactor `workspaceTabs()` and
   `enrichAwsWorkspace()` to derive from it. Pure refactor; existing tests keep
   passing unchanged.
2. **Preferences store** (`backend/daemon/internal/app/preferences.go`): load/save
   `preferences.json`, in-memory copy guarded like other service state, default =
   empty (everything enabled).
3. **RPCs**: `preferences/get` and `preferences/update`, following the existing
   handler pattern (see `handleAwsInventoryGet`). Update returns the new effective
   catalogue so the UI can refresh nav in one round trip.
4. Frontend types in `apps/desktop/src/types/backend.ts`.

### Phase 2: enforcement + settings page

5. **Tab filtering**: `workspaceTabs()` filters by preferences. Frontend nav derives
   from tabs, so it cleans up automatically. Add a fallback in the workspace tab
   router: if the active tab becomes disabled, jump to Overview.
6. **Enrichment filtering**: the snapshot builder skips enrichers for disabled
   services, and skips the whole provider block for disabled providers
   (`buildWorkspaceSnapshotOpts` in `workspace.go`).
7. **Provider filtering**: disabled providers drop out of the ConnectView provider
   picker (still visible in Settings so they can be re-enabled).
8. **Settings page** (new `SettingsView`, global scope):
   - Header: "Services" with the one-line promise: disabled means dormant, not just
     hidden.
   - One card per provider: provider icon, name, master toggle, "N of M enabled"
     count, Enable all / Disable all.
   - Beneath an enabled provider: grid of service toggle tiles (official icons from
     `assets/cloud-icons`, label, one-line summary from the catalogue).
   - Disabled provider card collapses to a single muted row.
   - Search filter across services.
   - Changes apply immediately via `preferences/update`; no restart.

### Phase 3: hidden-data hint

9. On Overview, a quiet chip: "Resources exist in N disabled services", expanding to
   name them with one-click enable. To protect the performance win, the check runs
   only on app start and when the settings page opens, never on the poll loop. It
   reuses the lightweight enrichers with a short timeout.

### Phase 4 (later): onboarding wizard

10. First-run flag (absence of `preferences.json` plus a `firstRunCompleted` marker).
11. Two steps: pick providers, then pick services (sensible set pre-ticked). Writes
    through the same `preferences/update` RPC. No new state model.

## Performance notes (honest expectations)

- AWS enrichers already run concurrently, so wall-clock snapshot latency is roughly
  the slowest enricher, not the sum. Disabling services mainly cuts total round-trips
  to LocalStack/AWS, contention, and log noise rather than headline latency.
- The larger wins: disabling whole providers (skips discovery and all enrichment),
  a cleaner nav, and fewer lazy chunks on disk-cold starts.

## Testing

- Catalogue refactor: existing `workspace_tabs_test.go` and enrichment tests pass
  unchanged before preferences are introduced.
- Preferences: unit tests for load/save/defaults, unknown service IDs ignored
  gracefully (forward compatibility), provider disable implies all its services.
- Enforcement: snapshot test proving a disabled service's enricher is never invoked;
  tab list test proving filtered output; router fallback test (active tab disabled
  lands on Overview).
- Settings UI: component tests for toggle wiring and enable-all/disable-all counts.

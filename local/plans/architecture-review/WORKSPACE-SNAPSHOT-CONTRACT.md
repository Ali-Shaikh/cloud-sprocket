# WorkspaceSnapshot contract (F-004 Phase 0)

**Status:** Phase 0 (contract + scoped rebuilds); wire shape unchanged  
**Updated:** 2026-07-23  
**Finding:** `local/plans/architecture-review/findings.md` F-004  
**Related:** `docs/performance-remediation-plan.md`, `docs/azure-load-performance-plan.md`

## Problem

`models.WorkspaceSnapshot` is a single mega DTO returned by most workspace-mutating RPCs. Deferred inventory reduced *work*, but:

1. Call sites can still rebuild **all** service inventories when they forget scope flags.
2. The JSON wire shape remains one large object, so clients merge partial payloads by empty-slice convention.
3. Future delta / push work cannot start until shell vs inventory responsibilities are explicit.

Phase 0 makes the contract explicit and stops accidental full rebuilds **without** changing JSON field names or payload type.

---

## 1. Layers

| Layer | Responsibility | Lives in snapshot today |
|-------|----------------|-------------------------|
| **Shell** | Session identity, write gates, settings, environment diagnostics | `provider`, `profile`, `authMethod`, `runtimeSettings`, `environmentDiagnostics`, write-mode flags, `actionCapabilities`, `localConfigArtifacts` |
| **Runtime** | Docker engine + managed emulators | `dockerRuntime`, `dockerResources`, `dockerDiagnostics`, `emulatorSummaries` |
| **Inventory** | Per-cloud, per-service resource lists and selection detail | All `s3*`, `ec2*`, `lambda*`, … and all `azure*` inventory fields |

Rules of thumb:

- **Shell** is cheap and almost always present when a workspace is open.
- **Runtime** may be TTL-cached; `runtime.get` is the dedicated poll path and must not rebuild inventory.
- **Inventory** is expensive; load only what the RPC’s scope requires. Unloaded services stay as **empty slices / zero values**, not omitted keys (current wire convention).

---

## 2. Who returns what today

| RPC / path | Return type | Shell | Runtime | Inventory |
|------------|-------------|-------|---------|-----------|
| `workspace.get` | `WorkspaceSnapshot` | Yes | Yes (via snapshot builder cache) | **Deferred**: AWS → S3 + EC2 core only; Azure → RGs + VMs only. Opposite cloud not loaded (provider-gated). |
| `aws.inventory.get` `{scope}` | `WorkspaceSnapshot` | Yes | Yes | **One** AWS service (`awsScope`); `skipAzureInventory` |
| `azure.inventory.get` `{scope}` | `WorkspaceSnapshot` | Yes | Yes | **One** Azure service (`azureScope`); `skipAwsInventory`; storage is non-lightweight |
| AWS selection / write finishes (`finishAWSWorkspaceOpts`) | `WorkspaceSnapshot` | Yes | Yes | Prefer full AWS inventory + `skipAzureInventory` when the client **replaces** workspace (EC2 select, jobs). Use `awsScope` only where the client **merges** (e.g. `aws.inventory.get`). |
| Azure selection / write finishes (`finishAzureWorkspaceOpts`) | `WorkspaceSnapshot` | Yes | Yes | Scoped `azureScope` / RG selection + `skipAwsInventory` where desktop merges; otherwise full Azure + skip AWS |
| `runtime.get` | `RuntimeSnapshot` | No | Yes (live probe) | **Never** |
| `session.get` / select provider-profile-auth | `SessionSnapshot` (not workspace) | Session only | No | No |
| Discovery refresh job result | `WorkspaceSnapshot` | Yes | Yes | Same deferred options as `workspace.get` |
| Async EC2 / RDS action job results | `WorkspaceSnapshot` | Yes | Yes | **Full AWS inventory**, `skipAzureInventory` only. Desktop `job.updated` **replaces** workspace; service-scoped results would wipe other tabs. |

**Empty-slice contract:** clients must treat an empty inventory array as "not loaded or empty", and **merge** scoped responses into local state rather than replacing the whole inventory map blindly when a partial is returned. Desktop already does Azure partial merge in places; Phase 1 may formalise that. Paths that replace workspace wholesale must not return service-scoped inventory.

---

## 3. `workspaceSnapshotOptions` field matrix

Defined in `backend/daemon/internal/app/workspace.go` (unexported; daemon-only).

| Field | Effect | Typical callers |
|-------|--------|-----------------|
| `lightweightAWS` | Skip expensive AWS drill-down (objects, instances, etc. where enricher supports it) | `workspace.get`, `aws.inventory.get` |
| `lightweightAzure` | Skip expensive Azure drill-down (blobs, WAF policy detail, etc.) | `workspace.get`, most Azure inventory scopes |
| `awsDeferredInventory` | Only S3 buckets + EC2 regions (via `enrichAwsInventory`) | `workspace.get` (AWS), discovery refresh job |
| `azureDeferredInventory` | Only resource groups + VMs (via `enrichAzureInventory`) | `workspace.get` (Azure), discovery refresh job |
| `awsScope` | Run a single AWS inventory enricher | Selection handlers, `aws.inventory.get`, write finishes |
| `azureScope` | Run a single Azure inventory enricher | Selection handlers, `azure.inventory.get`, write finishes |
| `skipAwsInventory` | Do not run any AWS enrichers | Azure-only paths |
| `skipAzureInventory` | Do not run any Azure enrichers | AWS-only paths |
| `azureResourceGroupSelection` | Refresh RGs, VMs, App Service for selected RG only | Azure RG / VM selection |

### Combinations that matter

| Intent | Options |
|--------|---------|
| Full first paint (deferred) | `lightweightAWS` + `lightweightAzure` + deferred flag for current provider |
| Tab open (AWS) | `awsScope`, `skipAzureInventory`, usually `lightweightAWS: true` |
| Tab open (Azure storage) | `azureScope: "storage"`, `skipAwsInventory`, `lightweightAzure: false` |
| Tab open (Azure other) | `azureScope`, `skipAwsInventory`, `lightweightAzure: true` |
| Selection drill-down | Scope set; lightweight **false** when detail is required (WAF policy, blobs, …) |
| Opposite cloud idle | Always set `skipAwsInventory` or `skipAzureInventory` on single-cloud RPCs |

### Forbidden patterns (Phase 0 audit)

- `buildWorkspaceSnapshot(...)` with empty options on a single-service handler (rebuilds **all** enabled AWS services).
- `finishAWSWorkspace` / empty `workspaceSnapshotOptions{}` on AWS mutation paths.
- Azure mutation finishes that omit `skipAwsInventory` (defensive; provider gate already helps).
- Calling `buildWorkspaceSnapshot` / `Discover` from `runtime.get`.

---

## 4. Target end-state (not implemented in Phase 0)

Split the mega DTO into explicit types while keeping a compatibility façade if needed:

```text
WorkspaceShell
  provider, profile, auth, settings, diagnostics, write gates, capabilities

RuntimeSnapshot          (already exists; keep as dedicated RPC result)
  docker*, emulators

InventorySlice           (or per-provider partial)
  providerId, scope, fields for that scope only
  loadedScopes: []string  // optional metadata for clients
```

Possible Phase 1+ shapes (design only):

- `workspace.get` → `WorkspaceShell` + deferred core inventory + runtime summary.
- `*.inventory.get` → `InventorySlice` (or still full `WorkspaceSnapshot` until clients migrate).
- Selection handlers → `InventorySlice` + optional shell patch.
- Optional later: `WorkspaceSnapshotDelta` with `op: set|clear` per scope (new wire format; needs versioning).

Frontend would own a merge store keyed by provider + scope. No codegen required for Phase 0.

---

## 5. Non-goals for Phase 0

- **No** mass `omitempty` change on inventory slices (would break “empty means unloaded/empty” and client merges).
- **No** deleting fields from `WorkspaceSnapshot` or TS mirrors.
- **No** OpenAPI / jsonschema / shared codegen (tracked under F-010).
- **No** delta wire format or push protocol.
- **No** parallelisation rewrites of enrichers beyond existing behaviour.
- **No** frontend merge redesign (may follow once the contract is stable).

---

## 6. Phase 0 implementation checklist

- [x] This design document
- [x] Audit bare `buildWorkspaceSnapshot` / unscoped finish helpers
- [x] Align clear AWS-only and Azure-only mutation paths with scope + skip flags
- [x] Tests locking deferred `workspace.get` behaviour and options → empty slices
- [x] CHANGELOG note for rebuild cost improvements

## 7. Follow-ups

| Phase | Work |
|-------|------|
| 1 | Optional wire: inventory RPCs return `InventorySlice`; shell-only refresh path |
| 2 | Client merge store + stop shipping unused empty inventory arrays in new methods |
| 3 | Codegen or shared schema (with F-010) once shape stabilises |
| 4 | Delta / push if still needed after scope discipline |

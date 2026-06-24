# WAF Security Workbench

## Vision

CloudSprocket gives operators access to cloud **services** (inventory, browse, light writes) and
separate **tools**: curated workflows for day-to-day tasks that should "just work" without
fighting vendor portals.

Azure's WAF and Log Analytics UIs are built on the same diagnostic logs we already query via
KQL. CloudSprocket's advantage is **workflow**: subscription context, schema-aware queries,
tracking-reference investigation, policy context, and optional tuning actions in one desktop
session.

## Services vs tools

| Layer | Purpose | Examples (Azure) |
|-------|---------|------------------|
| **Workspace** | Session shell | Overview, Local Runtime, Activity |
| **Services** | Resource inventory and operations | Resource groups, VMs, Storage, App Service, Functions, Key Vault, Cosmos, Queues, Entra |
| **Tools** | Curated operational workflows | WAF Security, Log Analytics, Front Door (topology + access-log triage) |

Tools still use the same Azure APIs and Log Analytics backend as services. They differ in UX:
preset queries, guided investigation, overview dashboards, and guard-railed writes.

## WAF security workbench (phase 1)

### Data source

Front Door WAF diagnostic logs in Log Analytics:

- `AzureDiagnostics` + category `FrontDoorWebApplicationFirewallLog` (classic pipeline)
- Resource-specific table `FrontDoorWebApplicationFirewallLog` (Standard/Premium)

**Prerequisite:** diagnostic settings must send WAF logs to the selected workspace.

### Capabilities shipped

1. **Overview dashboard** (auto on tab open)
   - Action breakdown (Block, Log, AnomalyScoring, JS challenge, etc.)
   - Top rules and top blocked client IPs (24h, policy-scoped)
   - Parallel KQL with small row limits for speed

2. **Investigation** (existing, extended)
   - Tracking reference (`X-Azure-Ref`) lookup
   - Curated KQL library (blocked, anomaly scoring, aggregates)
   - Decoded match details in result rows
   - Filters: client IP, host, rule, URI

3. **Policy context** (existing)
   - Policy config read, rule fire counts, exclusions, guarded writes

### Phase 2 (shipped)

- Request correlation: group rows by `trackingReference` / `TransactionId`
- WAF + Front Door access-log jump for the same ref
- Application Gateway WAF (`AGWFirewallLogs` schema) in schema probe + KQL
- False-positive playbook: match → suggested exclusion → confirm (when write mode on)
- Optional Azure Monitor metrics tiles (block rate trends) (planned)

### Phase 3 (shipped)

- Dedicated **Tools** hub page (`azure-tools`) listing Azure operational workflows
- Shared KQL query execution layer (`log-query-execution.ts`): row limits and server-side pagination in Log Analytics and WAF
- SOC investigation export bundle (query, schema, decoded rows, CSV/JSON attachments) from WAF results

## Hard limits (transparent)

- **Logs only** — no live request tap API from Azure
- **Ingestion delay** — typically minutes, not milliseconds
- **Row caps** — large investigations need narrower time ranges or paging
- **Application Gateway supported via `AGWFirewallLogs`** — App Service WAF is still a separate schema
- **Plaintext match data** in logs — handle accordingly in exports and screen sharing

## References

- [Azure Front Door WAF monitoring](https://learn.microsoft.com/en-us/azure/web-application-firewall/afds/waf-front-door-monitor)
- [AGWFirewallLogs table](https://learn.microsoft.com/en-us/azure/azure-monitor/reference/tables/agwfirewalllogs)
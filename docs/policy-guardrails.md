# Policy guardrails

CloudSprocket evaluates every saved OpenTofu plan in the daemon before it can
be applied. The desktop displays the result, but the daemon remains the
enforcement boundary.

The evaluator consumes the documented [OpenTofu JSON plan
format](https://opentofu.org/docs/internals/json-format/). It accepts format
major version 1, ignores unknown fields from compatible minor versions, and
requires a new implementation review before accepting another major version.

## Bundled rules

| Rule | Severity | Detects |
| --- | --- | --- |
| `aws.s3.public-access` | Deny | Public S3 ACLs or disabled S3 public-access-block settings |
| `aws.network.open-management-port` | Deny | SSH, RDP, or WinRM exposed to IPv4 or IPv6 world CIDRs |
| `aws.iam.wildcard-action` | Warning | `Action` or `NotAction` containing `*` in inline IAM policy JSON |
| `cloud.tags.required` | Warning | Missing configured tags on known taggable AWS and Azure resources |
| `cloud.region.allowlist` | Deny | Resource or provider regions outside the configured allowlist, including provider regions that cannot be resolved |

The bundled catalogue is deliberately small and deterministic. Findings are
sorted before their decision digest is generated, so the same saved plan and
configuration produce the same decision.

## Enforcement

- Local emulator targets convert deny findings to warning-only results. Apply
  remains available.
- Live targets are blocked when one or more deny findings exist.
- A blocked live plan can only proceed after the operator enters the exact
  phrase `APPLY <deployment-id>`.
- The daemon records the accepted override in Activity with the blocking rule
  IDs.
- An override is bound to the exact plan and decision digests. Replanning,
  changing the saved plan, changing policy configuration, or changing the
  findings invalidates it.
- The daemon hashes and re-evaluates the saved binary plan immediately before
  apply. Drift checks use a separate plan file and cannot replace the plan that
  was reviewed.

## Configuration

Policy configuration is read when the daemon starts.

| Environment variable | Default | Behaviour |
| --- | --- | --- |
| `CLOUDSPROCKET_POLICY_REQUIRED_TAGS` | `Environment,ManagedBy` | Comma-separated required tag names. Set to an empty value to disable the tag rule. |
| `CLOUDSPROCKET_POLICY_ALLOWED_REGIONS` | Empty | Comma-separated region or location allowlist. An empty value disables the region rule. |

Values are trimmed and duplicate entries are removed. Tag names and region
values are compared exactly.

## Implementation choice

The policy spike tested the current OPA Go integration at v1.17.0. Importing
the Rego evaluator also linked the WebAssembly feature path and Wasmtime into
the daemon. With the same `go build -trimpath` command, the experimental
OPA-linked Windows daemon was 152,350,720 bytes. The final native evaluator is
44,198,912 bytes, a reduction of 108,151,808 bytes.

The native evaluator has no external service, runtime binary, paid feature, or
new Go module dependency. Its public evaluation, digest, severity, and
override contracts remain isolated in `internal/policy`, so the implementation
can be revisited if a lightweight standards-based engine becomes practical.

# Guided labs platform

CloudSprocket recipes can define guided lab steps with actions, verification
checks, and optional local-runtime faults. Lab progress and fault recovery
metadata are stored in SQLite through the application settings store.

## Fault contract

Fault kinds are a closed manifest boundary:

- `pause`
- `latency`
- `partition`
- `service-error`

Only `pause` is currently advertised by the managed Docker Compose runtime. The
other kinds are reserved for future vendor-neutral backends and must not be
presented as available until an injector can apply them.

Production injectors also validate the target against the runtime's managed
container allowlist. An imported recipe cannot pause an arbitrary Docker
container by naming it in the manifest.

A fault step follows this lifecycle:

1. Persist `activeFault` metadata on the lab session.
2. Apply the runtime fault.
3. Run the step verification while the fault is active.
4. Revert the fault.
5. Clear `activeFault` only after a successful revert.

The daemon scans stored deployments during start-up and replays any unfinished
revert. Docker unpause recovery is idempotent for running or removed containers,
so a crash between unpause and journal cleanup is safe to recover again.

Unsupported runtimes expose a step-level capability reason. Running that step
marks it skipped and advances the lab instead of failing the whole session.
Magento Compose does not advertise pause yet because its services do not have a
stable deployment-owned target mapping.

## Controlled outage example

```yaml
steps:
  - id: observe-runtime-outage
    title: Observe a controlled outage
    fault:
      kind: pause
      target: cloudsprocket-localstack-localstack-1
    verify:
      - type: http.unreachable
        url: http://localhost:4566/_localstack/health
```

`http.unreachable` uses a three-second probe timeout. It passes only when the
dependency does not return an HTTP response while the fault is active. The
runner restores the container before returning the verification result.

This implementation uses the standard Docker
[`pause`](https://docs.docker.com/reference/cli/docker/container/pause/) and
[`unpause`](https://docs.docker.com/reference/cli/docker/container/unpause/)
commands. It does not require a vendor chaos API or paid emulator feature.

## Orphan PostgreSQL data-plane containers (floci-az)

The PostgreSQL Flexible Server lab (`lab-postgres-flexible-azure`) is **not**
cloud-only: it runs on floci-az locally or on a real Azure subscription. On
floci-az, each logical flexible server is backed by a real Postgres container
(typically named `floci-az-pg-*`).

Prefer a successful OpenTofu **Destroy** from CloudSprocket so ARM state and
data-plane containers are removed together. If destroy or cancel fails part-way
(for example after a Windows provider lock, a killed apply, or a floci-az
restart), orphan containers may remain even when the deployment record is gone.

Manual cleanup on the host Docker engine:

```bash
docker ps -a --filter "name=floci-az-pg-"
docker rm -f <container-id-or-name>
```

Only remove containers you are sure belong to abandoned local labs. Do not mark
this recipe cloud-only to avoid the issue; fix locks with Stop/Remove retries
and clean orphans as above when destroy cannot complete.

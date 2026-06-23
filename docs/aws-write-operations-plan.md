# AWS Write Operations Plan

**Status:** Phase 1 in progress (v0.8.13)  
**Date:** 23 June 2026  
**Scope:** Expand write-gated creation and mutation on existing AWS service tabs (LocalStack / local endpoints only).

---

## Write gating (unchanged)

All mutations require `effectiveAWSWritesEnabled`:

1. Profile `cloudsprocket_allow_writes = true` and `endpoint_url` points at LocalStack, localhost, or a private IP.
2. Session write mode enabled via top-bar toggle (`session.setWriteMode`).

Real AWS accounts remain read-only.

---

## Current write surface (v0.8.12)

| Service | Write RPCs | UI |
|---------|------------|-----|
| S3 | `uploadObject` | Upload page |
| EC2 | `invokeAction` (start/stop/reboot) | Lifecycle buttons |
| Lambda | `invoke`, `create` | Invoke + create form |
| SQS | `peek` | Peek dialog |

All other AWS tabs are inventory-only.

---

## Phase 1 — Messaging and data writes (v0.8.13)

**Goal:** Complete the LocalStack dev loop for queue, topic, and table workflows.

| Service | New RPC | Adapter | UI | Cache bust |
|---------|---------|---------|-----|------------|
| SQS | `aws.sqs.sendMessage` | `SendMessage` | Message body + Send on queue detail | — (sync result) |
| SQS | `aws.sqs.createQueue` | `CreateQueue` | Create queue form on fleet card | `aws.sqs.queues` |
| SNS | `aws.sns.publish` | `Publish` | Message body + Publish on topic detail | — (sync result) |
| SNS | `aws.sns.createTopic` | `CreateTopic` | Create topic form on fleet card | `aws.sns.topics` |
| DynamoDB | `aws.dynamodb.putItem` | `PutItem` | JSON item editor on table detail | refresh via `finishAWSWorkspaceOpts` |
| DynamoDB | `aws.dynamodb.deleteItem` | `DeleteItem` | Key JSON + delete confirm | refresh via `finishAWSWorkspaceOpts` |

**Exit:** SQS, SNS, and DynamoDB tabs support write-mode actions with confirm dialogs and Vitest coverage.

---

## Phase 2 — Storage and compute writes (v0.8.14)

| Service | RPC | Notes |
|---------|-----|-------|
| S3 | `aws.s3.deleteObject` | Selected object delete with confirm |
| S3 | `aws.s3.createBucket` | Name + region; bust bucket list |
| EC2 | `aws.ec2.runInstances` | Minimal LocalStack instance create |
| EC2 | `aws.ec2.terminateInstances` | Destructive; double confirm |
| Lambda | `aws.lambda.deleteFunction` | Remove function; bust function list |

---

## Phase 3 — Breadth service writes (v0.8.15)

| Service | RPC | Notes |
|---------|-----|-------|
| RDS | `aws.rds.startInstance`, `aws.rds.stopInstance` | Instance lifecycle |
| Logs | `aws.logs.createLogGroup`, `aws.logs.putLogEvents` | Tail + inject test events |
| IAM | `aws.iam.createRole` | Support Lambda create dependency path |

---

## Phase 4 — New service inventory + writes (v0.8.16+)

See `docs/aws-services-expansion-plan.md` for ECS, API Gateway, Secrets Manager (reveal write-gated), etc.

---

## Implementation checklist (per write RPC)

- [ ] `awsadapter` method with endpoint override
- [ ] `interfaces.go` interface method
- [ ] `stub*Inventory` in `service_test.go`
- [ ] Handler in `aws_*.go` with `effectiveAWSWritesEnabled` guard
- [ ] `service.go` case registration
- [ ] Model result type in `models.go`
- [ ] TypeScript type in `types/backend.ts`
- [ ] Mock in `lib/backend.ts`
- [ ] View UI + `App.tsx` wiring
- [ ] Go handler test + Vitest view test

---

## PR stack

| PR | Branch | Release |
|----|--------|---------|
| 1 | `feat/aws-write-operations` | v0.8.13 |
| 2 | `feat/aws-s3-ec2-writes` | v0.8.14 |
| 3 | `feat/aws-breadth-writes` | v0.8.15 |

Merge to `dev` with fast-forward; tag after CI passes (no version bump on feature branches).
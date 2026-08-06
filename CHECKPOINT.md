# Checkpoint

## Branch
`feat/aws-azure-operator-features-4` (rebased onto prior SNS/Cosmos commit)

## PR
https://github.com/Ali-Shaikh/cloud-sprocket/pull/342

## Features on branch
1. **AWS SQS purge queue** (`aws.sqs.purgeQueue`) – write-gated, confirmation UI
2. **AWS ECS update desired count** (`aws.ecs.updateDesiredCount`) – write-gated scale UI
3. **GCP GKE select cluster + list node pools** (`gcp.gke.selectCluster`) – read-only foundation
4. **AWS SNS create subscription** (`aws.sns.createSubscription`) – prior commit on branch
5. **Azure Cosmos delete item** (`azure.cosmos.deleteItem`) – prior commit on branch

## Status
- Pushed; PR #342 updated
- Go tests + Vitest for SQS/ECS/GKE views passed

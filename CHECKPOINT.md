# Checkpoint

## Branch
`feat/aws-azure-operator-features-4` from `origin/dev`

## Features implemented
1. **AWS SQS purge queue** (`aws.sqs.purgeQueue`) – write-gated, confirmation UI
2. **AWS ECS update desired count** (`aws.ecs.updateDesiredCount`) – write-gated scale UI
3. **GCP GKE select cluster + list node pools** (`gcp.gke.selectCluster`) – read-only foundation

## Status
- Backend + desktop vertical slices complete
- Go tests: awsadapter, gcpadapter, app/aws, app – passed
- Vitest: SQSView, ECSView, GcpGkeView – passed
- Next: commit, push, open PR to `dev`

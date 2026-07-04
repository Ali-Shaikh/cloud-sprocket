# Checkpoint

**Branch:** `feat/aws-apigateway` (PR pending)
**Latest:** API Gateway tab ready for review (AWS expansion Phase 2, service 2/3)

## Shipped
- PR #79: ECS / Fargate tab (`feat/aws-ecs` → `dev`)
- PR #78: action hooks refactor (on `dev`)

## In progress
- `feat/aws-apigateway` — API Gateway tab (REST + HTTP/WebSocket, stages + invoke URLs)
  - Backend: `awsadapter/apigateway.go`, `app/aws_apigateway.go`, deferred scope `apigateway`
  - Frontend: `ApiGatewayView.tsx`, tab router + hooks wired
  - Tests: 185 desktop + Go green

## Next (Target B)
- Merge API Gateway PR
- `feat/aws-secrets` — Secrets Manager tab
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

// Package aws owns AWS-domain RPC handlers that no longer need the full app
// façade. Phase 4 covers inventory.get, selection groups, and sync write
// groups (SQS/SNS/DynamoDB/IAM/secrets); async EC2/RDS jobs stay on the
// façade until a later slice (F-029).
package aws

import (
	"time"

	"cloudsprocket/backend/daemon/internal/app/sessionport"
)

// Deps holds collaborators required to construct an AWS domain Service.
type Deps struct {
	Discovery     Discovery
	Session       sessionport.Session
	Workspace     sessionport.Workspace
	Activity      sessionport.Activity
	Invalidator   sessionport.Invalidator
	Gate          ServiceGate
	Catalog       ScopeCatalog
	ActionTimeout time.Duration
	SQS           SQSWriter
	SNS           SNSWriter
	DynamoDB      DynamoDBWriter
	IAM           IAMWriter
	Secrets       SecretsReader
}

// Service owns the extracted AWS inventory, selection, and write RPC paths.
type Service struct {
	discovery     Discovery
	session       sessionport.Session
	workspace     sessionport.Workspace
	activity      sessionport.Activity
	invalidator   sessionport.Invalidator
	gate          ServiceGate
	catalog       ScopeCatalog
	actionTimeout time.Duration
	sqs           SQSWriter
	sns           SNSWriter
	dynamodb      DynamoDBWriter
	iam           IAMWriter
	secrets       SecretsReader
}

// New constructs an AWS domain Service.
func New(deps Deps) *Service {
	return &Service{
		discovery:     deps.Discovery,
		session:       deps.Session,
		workspace:     deps.Workspace,
		activity:      deps.Activity,
		invalidator:   deps.Invalidator,
		gate:          deps.Gate,
		catalog:       deps.Catalog,
		actionTimeout: deps.ActionTimeout,
		sqs:           deps.SQS,
		sns:           deps.SNS,
		dynamodb:      deps.DynamoDB,
		iam:           deps.IAM,
		secrets:       deps.Secrets,
	}
}

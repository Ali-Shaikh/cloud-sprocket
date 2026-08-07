// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

// Package labs owns labs.* JSON-RPC handlers, verification check-registry
// assembly, AWS invoke-write dispatch, and startup fault recovery (F-029 Phase 6).
// The façade supplies inventory adapters and action timeout only.
package labs

import (
	"time"

	"cloudsprocket/backend/daemon/internal/app/sessionport"
)

// Deps holds collaborators required to construct a labs domain Service.
type Deps struct {
	Discovery     Discovery
	Session       sessionport.Session
	Invalidator   sessionport.Invalidator
	Deployments   Deployments
	Recipes       Recipes
	Runner        Runner
	ActionTimeout time.Duration
	// AWS write ports for invoke-write lab actions (F-029 Phase 6c).
	SQS      SQSWrite
	DynamoDB DynamoDBWrite
	SNS      SNSWrite
	Lambda   LambdaWrite
	Logs     LogsWrite
	S3       S3Write
}

// Service owns the extracted labs RPC paths and startup fault recovery.
type Service struct {
	discovery     Discovery
	session       sessionport.Session
	invalidator   sessionport.Invalidator
	deployments   Deployments
	recipes       Recipes
	runner        Runner
	actionTimeout time.Duration
	sqs           SQSWrite
	dynamodb      DynamoDBWrite
	sns           SNSWrite
	lambda        LambdaWrite
	logs          LogsWrite
	s3            S3Write
}

// New constructs a labs domain Service.
func New(deps Deps) *Service {
	return &Service{
		discovery:     deps.Discovery,
		session:       deps.Session,
		invalidator:   deps.Invalidator,
		deployments:   deps.Deployments,
		recipes:       deps.Recipes,
		runner:        deps.Runner,
		actionTimeout: deps.ActionTimeout,
		sqs:           deps.SQS,
		dynamodb:      deps.DynamoDB,
		sns:           deps.SNS,
		lambda:        deps.Lambda,
		logs:          deps.Logs,
		s3:            deps.S3,
	}
}

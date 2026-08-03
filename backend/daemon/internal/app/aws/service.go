// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

// Package aws owns AWS-domain RPC handlers that no longer need the full app
// façade. Phase 4 covers inventory.get, selection groups, sync writes, and
// async S3/EC2/RDS job handlers (F-029).
package aws

import (
	"fmt"
	"time"

	"cloudsprocket/backend/daemon/internal/app/sessionport"
	"cloudsprocket/backend/daemon/internal/models"
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
	Now           func() time.Time
	SQS           SQSWriter
	SNS           SNSWriter
	DynamoDB      DynamoDBWriter
	IAM           IAMWriter
	Secrets       SecretsReader
	S3            S3Writer
	Lambda        LambdaWriter
	Logs          LogsWriter
	EC2           EC2Writer
	EC2Lifecycle  EC2Lifecycle
	RDSLifecycle  RDSLifecycle
}

// Service owns the extracted AWS inventory, selection, write, and job RPC paths.
type Service struct {
	discovery     Discovery
	session       sessionport.Session
	workspace     sessionport.Workspace
	activity      sessionport.Activity
	invalidator   sessionport.Invalidator
	gate          ServiceGate
	catalog       ScopeCatalog
	actionTimeout time.Duration
	now           func() time.Time
	sqs           SQSWriter
	sns           SNSWriter
	dynamodb      DynamoDBWriter
	iam           IAMWriter
	secrets       SecretsReader
	s3            S3Writer
	lambda        LambdaWriter
	logs          LogsWriter
	ec2           EC2Writer
	ec2Lifecycle  EC2Lifecycle
	rdsLifecycle  RDSLifecycle
}

// New constructs an AWS domain Service.
func New(deps Deps) *Service {
	now := deps.Now
	if now == nil {
		now = func() time.Time { return time.Now().UTC() }
	}
	return &Service{
		discovery:     deps.Discovery,
		session:       deps.Session,
		workspace:     deps.Workspace,
		activity:      deps.Activity,
		invalidator:   deps.Invalidator,
		gate:          deps.Gate,
		catalog:       deps.Catalog,
		actionTimeout: deps.ActionTimeout,
		now:           now,
		sqs:           deps.SQS,
		sns:           deps.SNS,
		dynamodb:      deps.DynamoDB,
		iam:           deps.IAM,
		secrets:       deps.Secrets,
		s3:            deps.S3,
		lambda:        deps.Lambda,
		logs:          deps.Logs,
		ec2:           deps.EC2,
		ec2Lifecycle:  deps.EC2Lifecycle,
		rdsLifecycle:  deps.RDSLifecycle,
	}
}

func (s *Service) newJobID() string {
	return fmt.Sprintf("job-%d", s.now().UnixNano())
}

func (s *Service) jobTimestamp() string {
	if s != nil && s.activity != nil {
		return s.activity.Timestamp()
	}
	return s.now().UTC().Format(time.RFC3339)
}

func (s *Service) notifyJob(notifier sessionport.Notifier, job models.JobStatus) {
	if s != nil && s.activity != nil {
		s.activity.NotifyJob(notifier, job)
		return
	}
	if notifier != nil {
		_ = notifier.Notify("job.updated", job)
	}
}

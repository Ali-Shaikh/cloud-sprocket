// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package labs

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"cloudsprocket/backend/daemon/internal/deploy"
	"cloudsprocket/backend/daemon/internal/discovery"
	"cloudsprocket/backend/daemon/internal/models"
)

// InvokeWrite gates and dispatches a lab invoke-write operation against AWS
// inventory adapters. Op names are a closed set documented for recipe authors.
func (s *Service) InvokeWrite(
	ctx context.Context,
	_ discovery.Snapshot,
	session models.SessionSnapshot,
	deployment *deploy.Deployment,
	profile models.ProfileSummary,
	region string,
	op string,
	params map[string]string,
) (any, error) {
	if s == nil {
		return nil, errors.New("labs write service is not available")
	}
	op = strings.TrimSpace(op)
	handler, ok := s.writeHandlers()[op]
	if !ok {
		return nil, fmt.Errorf("lab write operation %q is not supported", op)
	}
	return handler(ctx, session, deployment, profile, region, params)
}

// writeHandler executes one gated lab invoke-write op.
type writeHandler func(
	ctx context.Context,
	session models.SessionSnapshot,
	deployment *deploy.Deployment,
	profile models.ProfileSummary,
	region string,
	params map[string]string,
) (any, error)

// writeHandlers is the dispatch table for invoke-write ops (same write-mode
// gating as the workspace write RPCs). Built once per call; the map is small
// and allocation is cheap relative to the RPC.
func (s *Service) writeHandlers() map[string]writeHandler {
	// Keep the set closed: every key must also be documented for recipe authors.
	return map[string]writeHandler{
		"sqs.send":      s.writeSQSSend,
		"dynamodb.put":  s.writeDynamoPut,
		"sns.publish":   s.writeSNSPublish,
		"lambda.invoke": s.writeLambdaInvoke,
		"logs.put":      s.writeLogsPut,
		"s3.upload":     s.writeS3Upload,
	}
}

func (s *Service) requireAWSWrite(
	session models.SessionSnapshot,
	deployment *deploy.Deployment,
	profile models.ProfileSummary,
	opLabel string,
) error {
	if deployment == nil {
		return errors.New("deployment is required")
	}
	if deployment.ProviderID != "aws" {
		return fmt.Errorf("%s is only available for AWS deployments", opLabel)
	}
	if !WritesEnabled(session, profile) {
		return fmt.Errorf("%s requires write mode to be enabled", opLabel)
	}
	return nil
}

func (s *Service) withActionTimeout(ctx context.Context) (context.Context, context.CancelFunc) {
	if s == nil || s.actionTimeout <= 0 {
		return ctx, func() {}
	}
	return context.WithTimeout(ctx, s.actionTimeout)
}

func (s *Service) writeSQSSend(
	ctx context.Context,
	session models.SessionSnapshot,
	deployment *deploy.Deployment,
	profile models.ProfileSummary,
	region string,
	params map[string]string,
) (any, error) {
	if err := s.requireAWSWrite(session, deployment, profile, "SQS send"); err != nil {
		return nil, err
	}
	if s.sqs == nil {
		return nil, errors.New("SQS write adapter is not available")
	}
	queueURL := strings.TrimSpace(params["queueUrl"])
	messageBody := params["messageBody"]
	if queueURL == "" {
		return nil, errors.New("queue URL is required")
	}
	if strings.TrimSpace(messageBody) == "" {
		return nil, errors.New("message body is required")
	}
	actionCtx, cancel := s.withActionTimeout(ctx)
	defer cancel()
	return s.sqs.SendMessage(actionCtx, profile, region, queueURL, messageBody)
}

func (s *Service) writeDynamoPut(
	ctx context.Context,
	session models.SessionSnapshot,
	deployment *deploy.Deployment,
	profile models.ProfileSummary,
	region string,
	params map[string]string,
) (any, error) {
	if err := s.requireAWSWrite(session, deployment, profile, "DynamoDB put"); err != nil {
		return nil, err
	}
	if s.dynamodb == nil {
		return nil, errors.New("DynamoDB write adapter is not available")
	}
	table := strings.TrimSpace(params["tableName"])
	itemJSON := params["itemJson"]
	if table == "" {
		return nil, errors.New("table name is required")
	}
	if strings.TrimSpace(itemJSON) == "" {
		return nil, errors.New("item JSON is required")
	}
	actionCtx, cancel := s.withActionTimeout(ctx)
	defer cancel()
	return s.dynamodb.PutItem(actionCtx, profile, region, table, itemJSON)
}

func (s *Service) writeSNSPublish(
	ctx context.Context,
	session models.SessionSnapshot,
	deployment *deploy.Deployment,
	profile models.ProfileSummary,
	region string,
	params map[string]string,
) (any, error) {
	if err := s.requireAWSWrite(session, deployment, profile, "SNS publish"); err != nil {
		return nil, err
	}
	if s.sns == nil {
		return nil, errors.New("SNS write adapter is not available")
	}
	topicArn := strings.TrimSpace(params["topicArn"])
	message := params["message"]
	if topicArn == "" {
		return nil, errors.New("topic ARN is required")
	}
	if strings.TrimSpace(message) == "" {
		return nil, errors.New("message is required")
	}
	actionCtx, cancel := s.withActionTimeout(ctx)
	defer cancel()
	return s.sns.Publish(actionCtx, profile, region, topicArn, message)
}

func (s *Service) writeLambdaInvoke(
	ctx context.Context,
	session models.SessionSnapshot,
	deployment *deploy.Deployment,
	profile models.ProfileSummary,
	region string,
	params map[string]string,
) (any, error) {
	if err := s.requireAWSWrite(session, deployment, profile, "Lambda invoke"); err != nil {
		return nil, err
	}
	if s.lambda == nil {
		return nil, errors.New("Lambda write adapter is not available")
	}
	functionName := strings.TrimSpace(params["functionName"])
	if functionName == "" {
		return nil, errors.New("function name is required")
	}
	payload := []byte("{}")
	if body := strings.TrimSpace(params["payload"]); body != "" {
		payload = []byte(body)
	}
	actionCtx, cancel := s.withActionTimeout(ctx)
	defer cancel()
	return s.lambda.InvokeFunction(actionCtx, profile, region, functionName, payload)
}

func (s *Service) writeLogsPut(
	ctx context.Context,
	session models.SessionSnapshot,
	deployment *deploy.Deployment,
	profile models.ProfileSummary,
	region string,
	params map[string]string,
) (any, error) {
	if err := s.requireAWSWrite(session, deployment, profile, "Logs put"); err != nil {
		return nil, err
	}
	if s.logs == nil {
		return nil, errors.New("Logs write adapter is not available")
	}
	group := strings.TrimSpace(params["logGroupName"])
	if group == "" {
		return nil, errors.New("log group name is required")
	}
	message := strings.TrimSpace(params["message"])
	if message == "" {
		return nil, errors.New("message is required")
	}
	actionCtx, cancel := s.withActionTimeout(ctx)
	defer cancel()
	return s.logs.PutLogEvents(actionCtx, profile, region, group, message)
}

func (s *Service) writeS3Upload(
	ctx context.Context,
	session models.SessionSnapshot,
	deployment *deploy.Deployment,
	profile models.ProfileSummary,
	_ string,
	params map[string]string,
) (any, error) {
	if err := s.requireAWSWrite(session, deployment, profile, "S3 upload"); err != nil {
		return nil, err
	}
	if s.s3 == nil {
		return nil, errors.New("S3 write adapter is not available")
	}
	bucket := strings.TrimSpace(params["bucketName"])
	key := strings.TrimSpace(params["objectKey"])
	source := strings.TrimSpace(params["sourcePath"])
	if bucket == "" || key == "" || source == "" {
		return nil, errors.New("bucketName, objectKey, and sourcePath are required")
	}
	actionCtx, cancel := s.withActionTimeout(ctx)
	defer cancel()
	return s.s3.UploadFile(actionCtx, profile, bucket, key, source)
}

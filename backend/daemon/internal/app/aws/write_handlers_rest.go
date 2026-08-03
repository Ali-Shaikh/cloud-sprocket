// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package aws

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"cloudsprocket/backend/daemon/internal/app/sessionport"
	"cloudsprocket/backend/daemon/internal/discovery"
	"cloudsprocket/backend/daemon/internal/models"
)

// HandleS3DeleteObject implements aws.s3.deleteObject.
func (s *Service) HandleS3DeleteObject(ctx context.Context, params json.RawMessage, notifier sessionport.Notifier) (any, error) {
	if s == nil || s.s3 == nil {
		return nil, errors.New("aws write service is not available")
	}
	var request struct {
		ObjectKey string `json:"objectKey"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	snapshot, err := s.discovery.Discover()
	if err != nil {
		return nil, err
	}
	profile, bucketName, objectKey, err := s.AuthorizeWriteSelection(
		ctx, snapshot,
		"S3 delete requires write mode to be enabled",
		func(snap discovery.Snapshot, session models.SessionSnapshot) (models.ProfileSummary, string, string, error) {
			return ActiveS3ObjectSelection(snap, session, request.ObjectKey)
		},
	)
	if err != nil {
		return nil, err
	}
	prefix := ""
	if sess, loadErr := s.session.Load(ctx, snapshot); loadErr == nil {
		prefix = sess.S3PrefixFilter
	}

	actionCtx, cancel := s.WithActionTimeout(ctx)
	_, err = s.s3.DeleteObject(actionCtx, profile, bucketName, objectKey)
	cancel()
	if err != nil {
		return nil, err
	}
	if s.invalidator != nil {
		s.invalidator.InvalidateResourceCache(ctx, "aws.s3.objects", profile.ProfileID+"|"+bucketName+"|"+prefix)
		s.invalidator.InvalidateResourceCache(ctx, "aws.s3.object-metadata", profile.ProfileID+"|"+bucketName+"|"+objectKey)
	}

	return s.FinishWriteAction(
		ctx, snapshot, notifier, "s3",
		fmt.Sprintf("Deleted object %s from bucket %s.", objectKey, bucketName),
		func(session *models.SessionSnapshot) {
			if session.SelectedS3ObjectKey == objectKey {
				session.SelectedS3ObjectKey = ""
			}
		},
	)
}

// HandleS3CreateBucket implements aws.s3.createBucket.
func (s *Service) HandleS3CreateBucket(ctx context.Context, params json.RawMessage, notifier sessionport.Notifier) (any, error) {
	if s == nil || s.s3 == nil {
		return nil, errors.New("aws write service is not available")
	}
	var request struct {
		BucketName string `json:"bucketName"`
		Region     string `json:"region"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	bucketName := strings.TrimSpace(request.BucketName)
	if bucketName == "" {
		return nil, errors.New("bucket name is required")
	}
	snapshot, err := s.discovery.Discover()
	if err != nil {
		return nil, err
	}
	_, profile, err := s.AuthorizeWrite(
		ctx, snapshot,
		"open an AWS workspace before creating an S3 bucket",
		"S3 create requires write mode to be enabled",
	)
	if err != nil {
		return nil, err
	}
	region := strings.TrimSpace(request.Region)
	if region == "" {
		region = ProfileRegionHint(profile)
	}

	actionCtx, cancel := s.WithActionTimeout(ctx)
	created, err := s.s3.CreateBucket(actionCtx, profile, bucketName, region)
	cancel()
	if err != nil {
		return nil, err
	}
	if s.invalidator != nil {
		s.invalidator.InvalidateResourceCache(ctx, "aws.s3.buckets", profile.ProfileID)
	}

	return s.FinishWriteAction(
		ctx, snapshot, notifier, "s3",
		fmt.Sprintf("Created S3 bucket %s in %s.", created.BucketName, created.Region),
		func(session *models.SessionSnapshot) {
			session.SelectedS3BucketName = created.BucketName
			session.SelectedS3ObjectKey = ""
		},
	)
}

// HandleS3CopyObject implements aws.s3.copyObject.
func (s *Service) HandleS3CopyObject(ctx context.Context, params json.RawMessage, notifier sessionport.Notifier) (any, error) {
	if s == nil || s.s3 == nil {
		return nil, errors.New("aws write service is not available")
	}
	var request struct {
		SourceObjectKey      string `json:"sourceObjectKey"`
		DestinationObjectKey string `json:"destinationObjectKey"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	destinationObjectKey := strings.TrimSpace(request.DestinationObjectKey)
	if destinationObjectKey == "" {
		return nil, errors.New("destination object key is required")
	}
	snapshot, err := s.discovery.Discover()
	if err != nil {
		return nil, err
	}
	profile, bucketName, sourceObjectKey, err := s.AuthorizeWriteSelection(
		ctx, snapshot,
		"S3 copy requires write mode to be enabled",
		func(snap discovery.Snapshot, session models.SessionSnapshot) (models.ProfileSummary, string, string, error) {
			return ActiveS3ObjectSelection(snap, session, request.SourceObjectKey)
		},
	)
	if err != nil {
		return nil, err
	}
	prefix := ""
	if sess, loadErr := s.session.Load(ctx, snapshot); loadErr == nil {
		prefix = sess.S3PrefixFilter
	}

	actionCtx, cancel := s.WithActionTimeout(ctx)
	copied, err := s.s3.CopyObject(actionCtx, profile, bucketName, sourceObjectKey, destinationObjectKey)
	cancel()
	if err != nil {
		return nil, err
	}
	if s.invalidator != nil {
		s.invalidator.InvalidateResourceCache(ctx, "aws.s3.objects", profile.ProfileID+"|"+bucketName+"|"+prefix)
	}

	return s.FinishWriteAction(
		ctx, snapshot, notifier, "s3",
		fmt.Sprintf("Copied %s to %s in bucket %s.", sourceObjectKey, destinationObjectKey, bucketName),
		func(session *models.SessionSnapshot) {
			session.SelectedS3ObjectKey = copied.DestinationObjectKey
		},
	)
}

// HandleS3CreateFolderPrefix implements aws.s3.createFolderPrefix.
func (s *Service) HandleS3CreateFolderPrefix(ctx context.Context, params json.RawMessage, notifier sessionport.Notifier) (any, error) {
	if s == nil || s.s3 == nil {
		return nil, errors.New("aws write service is not available")
	}
	var request struct {
		FolderPrefix string `json:"folderPrefix"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	folderPrefix := strings.TrimSpace(request.FolderPrefix)
	if folderPrefix == "" {
		return nil, errors.New("folder prefix is required")
	}
	snapshot, err := s.discovery.Discover()
	if err != nil {
		return nil, err
	}
	_, profile, err := s.AuthorizeWrite(
		ctx, snapshot,
		"open an AWS workspace before creating an S3 folder prefix",
		"S3 folder create requires write mode to be enabled",
	)
	if err != nil {
		return nil, err
	}
	session, loadErr := s.session.Load(ctx, snapshot)
	if loadErr != nil {
		return nil, loadErr
	}
	_, bucketName, bucketErr := ActiveS3Bucket(snapshot, session, true)
	if bucketErr != nil {
		return nil, bucketErr
	}
	prefix := session.S3PrefixFilter

	actionCtx, cancel := s.WithActionTimeout(ctx)
	created, err := s.s3.CreateFolderPrefix(actionCtx, profile, bucketName, folderPrefix)
	cancel()
	if err != nil {
		return nil, err
	}
	if s.invalidator != nil {
		s.invalidator.InvalidateResourceCache(ctx, "aws.s3.objects", profile.ProfileID+"|"+bucketName+"|"+prefix)
	}

	return s.FinishWriteAction(
		ctx, snapshot, notifier, "s3",
		fmt.Sprintf("Created folder prefix %s in bucket %s.", created.FolderPrefix, bucketName),
		func(session *models.SessionSnapshot) {
			session.S3PrefixFilter = created.FolderPrefix
		},
	)
}

// HandleLambdaDescribe implements aws.lambda.describe.
func (s *Service) HandleLambdaDescribe(ctx context.Context, params json.RawMessage, _ sessionport.Notifier) (any, error) {
	if s == nil || s.lambda == nil || s.session == nil || s.discovery == nil {
		return nil, errors.New("aws write service is not available")
	}
	var request struct {
		FunctionName string `json:"functionName"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	snapshot, err := s.discovery.Discover()
	if err != nil {
		return nil, err
	}
	session, err := s.session.Load(ctx, snapshot)
	if err != nil {
		return nil, err
	}
	profile, region, functionName, err := ActiveLambdaSelection(snapshot, session, request.FunctionName)
	if err != nil {
		return nil, err
	}
	return s.lambda.DescribeFunction(ctx, profile, region, functionName)
}

// HandleLambdaInvoke implements aws.lambda.invoke.
func (s *Service) HandleLambdaInvoke(ctx context.Context, params json.RawMessage, _ sessionport.Notifier) (any, error) {
	if s == nil || s.lambda == nil || s.session == nil || s.discovery == nil {
		return nil, errors.New("aws write service is not available")
	}
	var request struct {
		FunctionName string          `json:"functionName"`
		Payload      json.RawMessage `json:"payload"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	snapshot, err := s.discovery.Discover()
	if err != nil {
		return nil, err
	}
	session, err := s.session.Load(ctx, snapshot)
	if err != nil {
		return nil, err
	}
	profile, region, functionName, err := ActiveLambdaSelection(snapshot, session, request.FunctionName)
	if err != nil {
		return nil, err
	}
	if !WritesEnabled(session, profile) {
		return nil, errors.New("Lambda invoke requires write mode to be enabled")
	}
	payload := []byte(request.Payload)
	if len(payload) == 0 {
		payload = []byte("{}")
	}
	return s.lambda.InvokeFunction(ctx, profile, region, functionName, payload)
}

// HandleLambdaCreate implements aws.lambda.create.
func (s *Service) HandleLambdaCreate(ctx context.Context, params json.RawMessage, notifier sessionport.Notifier) (any, error) {
	if s == nil || s.lambda == nil {
		return nil, errors.New("aws write service is not available")
	}
	var request models.AwsLambdaCreateInput
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	if err := ValidateLambdaCreateInput(request); err != nil {
		return nil, err
	}
	snapshot, err := s.discovery.Discover()
	if err != nil {
		return nil, err
	}
	session, profile, err := s.AuthorizeWrite(
		ctx, snapshot,
		"open an AWS workspace before creating a Lambda function",
		"Lambda create requires write mode to be enabled",
	)
	if err != nil {
		return nil, err
	}
	_, region, regionErr := ActiveLambdaRegion(snapshot, session)
	if regionErr != nil {
		return nil, regionErr
	}

	created, err := s.lambda.CreateFunction(ctx, profile, region, request)
	if err != nil {
		return nil, err
	}
	if s.invalidator != nil {
		s.invalidator.InvalidateResourceCache(ctx, "aws.lambda.functions", profile.ProfileID+"|"+region)
	}

	return s.FinishWriteAction(
		ctx, snapshot, notifier, "lambda",
		fmt.Sprintf("Created Lambda function %s in %s.", created.FunctionName, region),
		func(session *models.SessionSnapshot) {
			session.SelectedLambdaFunctionName = created.FunctionName
		},
	)
}

// HandleLambdaDeleteFunction implements aws.lambda.deleteFunction.
func (s *Service) HandleLambdaDeleteFunction(ctx context.Context, params json.RawMessage, notifier sessionport.Notifier) (any, error) {
	if s == nil || s.lambda == nil {
		return nil, errors.New("aws write service is not available")
	}
	var request struct {
		FunctionName string `json:"functionName"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	snapshot, err := s.discovery.Discover()
	if err != nil {
		return nil, err
	}
	profile, region, functionName, err := s.AuthorizeWriteSelection(
		ctx, snapshot,
		"Lambda delete requires write mode to be enabled",
		func(snap discovery.Snapshot, session models.SessionSnapshot) (models.ProfileSummary, string, string, error) {
			return ActiveLambdaSelection(snap, session, request.FunctionName)
		},
	)
	if err != nil {
		return nil, err
	}

	actionCtx, cancel := s.WithActionTimeout(ctx)
	result, err := s.lambda.DeleteFunction(actionCtx, profile, region, functionName)
	cancel()
	if err != nil {
		return nil, err
	}
	if s.invalidator != nil {
		s.invalidator.InvalidateResourceCache(ctx, "aws.lambda.functions", profile.ProfileID+"|"+region)
	}

	return s.FinishWriteAction(
		ctx, snapshot, notifier, "lambda",
		result.Summary,
		func(session *models.SessionSnapshot) {
			if session.SelectedLambdaFunctionName == functionName {
				session.SelectedLambdaFunctionName = ""
			}
		},
	)
}

// HandleLogsCreateLogGroup implements aws.logs.createLogGroup.
func (s *Service) HandleLogsCreateLogGroup(ctx context.Context, params json.RawMessage, notifier sessionport.Notifier) (any, error) {
	if s == nil || s.logs == nil {
		return nil, errors.New("aws write service is not available")
	}
	var request struct {
		LogGroupName string `json:"logGroupName"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	logGroupName := strings.TrimSpace(request.LogGroupName)
	if logGroupName == "" {
		return nil, errors.New("log group name is required")
	}
	snapshot, err := s.discovery.Discover()
	if err != nil {
		return nil, err
	}
	session, profile, err := s.AuthorizeWrite(
		ctx, snapshot,
		"open an AWS workspace before creating a log group",
		"CloudWatch Logs create requires write mode to be enabled",
	)
	if err != nil {
		return nil, err
	}
	_, region, regionErr := ActiveLogsRegion(snapshot, session)
	if regionErr != nil {
		return nil, regionErr
	}

	actionCtx, cancel := s.WithActionTimeout(ctx)
	created, err := s.logs.CreateLogGroup(actionCtx, profile, region, logGroupName)
	cancel()
	if err != nil {
		return nil, err
	}
	if s.invalidator != nil {
		s.invalidator.InvalidateResourceCache(ctx, "aws.logs.groups", profile.ProfileID+"|"+region)
	}

	return s.FinishWriteAction(
		ctx, snapshot, notifier, "logs",
		fmt.Sprintf("Created log group %s in %s.", created.LogGroupName, created.Region),
		func(session *models.SessionSnapshot) {
			session.SelectedLogGroupName = created.LogGroupName
		},
	)
}

// HandleLogsPutLogEvents implements aws.logs.putLogEvents.
func (s *Service) HandleLogsPutLogEvents(ctx context.Context, params json.RawMessage, _ sessionport.Notifier) (any, error) {
	if s == nil || s.logs == nil {
		return nil, errors.New("aws write service is not available")
	}
	var request struct {
		LogGroupName string `json:"logGroupName"`
		Message      string `json:"message"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	logGroupName := strings.TrimSpace(request.LogGroupName)
	if logGroupName == "" {
		return nil, errors.New("log group name is required")
	}
	snapshot, err := s.discovery.Discover()
	if err != nil {
		return nil, err
	}
	session, profile, err := s.AuthorizeWrite(
		ctx, snapshot,
		"open an AWS workspace before injecting log events",
		"CloudWatch Logs put requires write mode to be enabled",
	)
	if err != nil {
		return nil, err
	}
	_, region, regionErr := ActiveLogsRegion(snapshot, session)
	if regionErr != nil {
		return nil, regionErr
	}

	actionCtx, cancel := s.WithActionTimeout(ctx)
	result, err := s.logs.PutLogEvents(actionCtx, profile, region, logGroupName, request.Message)
	cancel()
	if err != nil {
		return nil, err
	}
	return result, nil
}

// HandleLogsFilterEvents implements aws.logs.filterEvents (read-only search).
func (s *Service) HandleLogsFilterEvents(ctx context.Context, params json.RawMessage, _ sessionport.Notifier) (any, error) {
	if s == nil || s.logs == nil || s.session == nil || s.discovery == nil {
		return nil, errors.New("aws write service is not available")
	}
	var request struct {
		LogGroupName  string `json:"logGroupName"`
		FilterPattern string `json:"filterPattern"`
		Limit         int    `json:"limit"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	logGroupName := strings.TrimSpace(request.LogGroupName)
	if logGroupName == "" {
		return nil, errors.New("log group name is required")
	}
	snapshot, err := s.discovery.Discover()
	if err != nil {
		return nil, err
	}
	session, err := s.session.Load(ctx, snapshot)
	if err != nil {
		return nil, err
	}
	profile, region, err := ActiveLogsRegion(snapshot, session)
	if err != nil {
		return nil, err
	}

	actionCtx, cancel := s.WithActionTimeout(ctx)
	result, err := s.logs.FilterEvents(actionCtx, profile, region, logGroupName, request.FilterPattern, request.Limit)
	cancel()
	if err != nil {
		return nil, err
	}
	return result, nil
}

// HandleEC2RunInstances implements aws.ec2.runInstances.
func (s *Service) HandleEC2RunInstances(ctx context.Context, params json.RawMessage, notifier sessionport.Notifier) (any, error) {
	if s == nil || s.ec2 == nil {
		return nil, errors.New("aws write service is not available")
	}
	var request struct {
		InstanceType string `json:"instanceType"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	snapshot, err := s.discovery.Discover()
	if err != nil {
		return nil, err
	}
	session, profile, err := s.AuthorizeWrite(
		ctx, snapshot,
		"open an AWS workspace before launching EC2 instances",
		"EC2 launch requires write mode to be enabled",
	)
	if err != nil {
		return nil, err
	}
	region, err := ActiveEC2Region(session, profile)
	if err != nil {
		return nil, err
	}

	actionCtx, cancel := s.WithActionTimeout(ctx)
	launched, err := s.ec2.RunInstances(actionCtx, profile, region, request.InstanceType)
	cancel()
	if err != nil {
		return nil, err
	}
	if s.invalidator != nil {
		s.invalidator.InvalidateResourceCache(ctx, "aws.ec2.instances", profile.ProfileID+"|"+region)
	}

	return s.FinishWriteAction(
		ctx, snapshot, notifier, "ec2",
		launched.Summary,
		func(session *models.SessionSnapshot) {
			session.SelectedEC2Region = region
			session.SelectedEC2InstanceID = launched.InstanceID
		},
	)
}

// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package app

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	applabs "cloudsprocket/backend/daemon/internal/app/labs"
	"cloudsprocket/backend/daemon/internal/deploy"
	"cloudsprocket/backend/daemon/internal/discovery"
	"cloudsprocket/backend/daemon/internal/labs"
	"cloudsprocket/backend/daemon/internal/labs/checks"
	"cloudsprocket/backend/daemon/internal/models"
	"cloudsprocket/backend/daemon/internal/recipes"
)

// Thin façade wrappers for labs.* RPCs owned by internal/app/labs (F-029 Phase 6).
// AWS invoke-write ops stay on the façade; check-registry assembly lives in app/labs.

// newLabRunner returns a lazy production engine. Adapter method values are
// taken on first use so partial test façades without full inventory stubs stay
// constructible (same behaviour as the former labRunnerOnce path).
func (s *Service) newLabRunner() applabs.Runner {
	return applabs.NewLazyRunner(func() *labs.Runner {
		return applabs.NewRunnerFromDeps(
			labs.NewSessionStore(s.store),
			applabs.CheckDeps{
				SQS:        checks.SQSDeps{DescribeQueue: s.sqs.DescribeQueue},
				HTTP:       checks.HTTPDeps{Get: s.labsHTTPGet},
				S3:         checks.S3Deps{HeadObject: s.s3.HeadObject, GetObject: s.s3.GetObject},
				Dynamo:     checks.DynamoDeps{GetItem: s.dynamodb.GetItem},
				Lambda:     checks.LambdaDeps{Invoke: s.lambda.InvokeFunction},
				Logs:       checks.LogsDeps{DescribeLogGroup: s.logs.DescribeLogGroup},
				Secrets:    checks.SecretsDeps{GetSecretValue: s.secretsManager.GetSecretValue},
				SNS:        checks.SNSDeps{DescribeTopic: s.sns.DescribeTopic},
				AzureBlob:  checks.AzureBlobDeps{ListBlobs: s.azure.ListBlobs},
				AzureQueue: checks.AzureQueueDeps{ApproximateCount: s.azure.GetQueueApproximateMessageCount},
			},
			func() time.Time { return s.now() },
		)
	})
}

func (s *Service) recoverLabFaults(ctx context.Context) error {
	if s.labsDomain == nil {
		return nil
	}
	return s.labsDomain.RecoverActiveFaults(ctx)
}

func (s *Service) labsHTTPGet(ctx context.Context, targetURL string) (int, error) {
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, targetURL, nil)
	if err != nil {
		return 0, err
	}
	response, err := http.DefaultClient.Do(request)
	if err != nil {
		return 0, err
	}
	applabs.DrainAndCloseHTTPBody(response.Body)
	return response.StatusCode, nil
}

func (s *Service) handleLabsStart(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
	if s.labsDomain == nil {
		return nil, errors.New("labs service not available")
	}
	return s.labsDomain.HandleStart(ctx, params, notifier)
}

func (s *Service) handleLabsGet(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
	if s.labsDomain == nil {
		return nil, errors.New("labs service not available")
	}
	return s.labsDomain.HandleGet(ctx, params, notifier)
}

func (s *Service) handleLabsVerifyStep(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
	if s.labsDomain == nil {
		return nil, errors.New("labs service not available")
	}
	return s.labsDomain.HandleVerifyStep(ctx, params, notifier)
}

func (s *Service) handleLabsRunAction(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
	if s.labsDomain == nil {
		return nil, errors.New("labs service not available")
	}
	return s.labsDomain.HandleRunAction(ctx, params, notifier)
}

func (s *Service) handleLabsReset(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
	if s.labsDomain == nil {
		return nil, errors.New("labs service not available")
	}
	return s.labsDomain.HandleReset(ctx, params, notifier)
}

// labsDeploymentsAdapter exposes deployment list/get to the labs domain without
// importing the full deployment package into handler code paths.
type labsDeploymentsAdapter struct {
	s *Service
}

func (a labsDeploymentsAdapter) List(ctx context.Context) ([]deploy.Deployment, error) {
	return a.s.deploymentsList(ctx)
}

func (a labsDeploymentsAdapter) Get(ctx context.Context, id string) (*deploy.Deployment, error) {
	return a.s.deploymentGet(ctx, id)
}

// labsRecipesAdapter loads recipes through the deployment domain façade helpers.
type labsRecipesAdapter struct {
	s *Service
}

func (a labsRecipesAdapter) Load(id string) (recipes.Recipe, error) {
	return a.s.loadRecipe(id)
}

// labsWriteExecutorAdapter keeps invoke-write ops on the façade (AWS inventory
// ports and write-mode gating).
type labsWriteExecutorAdapter struct {
	s *Service
}

func (a labsWriteExecutorAdapter) InvokeWrite(
	ctx context.Context,
	snapshot discovery.Snapshot,
	session models.SessionSnapshot,
	deployment *deploy.Deployment,
	profile models.ProfileSummary,
	region string,
	op string,
	params map[string]string,
) (any, error) {
	return a.s.labsInvokeWrite(ctx, snapshot, session, deployment, profile, region, op, params)
}

// Compile-time proof that façade adapters satisfy labs domain ports.
// The engine (*labs.Runner) is proven against applabs.Runner in app/labs.
var (
	_ applabs.Deployments   = labsDeploymentsAdapter{}
	_ applabs.Recipes       = labsRecipesAdapter{}
	_ applabs.WriteExecutor = labsWriteExecutorAdapter{}
)

func (s *Service) labsInvokeWrite(
	ctx context.Context,
	snapshot discovery.Snapshot,
	session models.SessionSnapshot,
	deployment *deploy.Deployment,
	profile models.ProfileSummary,
	region string,
	op string,
	params map[string]string,
) (any, error) {
	_ = snapshot
	op = strings.TrimSpace(op)
	handler, ok := s.labWriteHandlers()[op]
	if !ok {
		return nil, fmt.Errorf("lab write operation %q is not supported", op)
	}
	return handler(ctx, session, deployment, profile, region, params)
}

// labWriteHandler executes one gated lab invoke-write op.
type labWriteHandler func(
	ctx context.Context,
	session models.SessionSnapshot,
	deployment *deploy.Deployment,
	profile models.ProfileSummary,
	region string,
	params map[string]string,
) (any, error)

// labWriteHandlers is the dispatch table for invoke-write ops (same write-mode
// gating as the workspace write RPCs). Built once per Service value via pointer
// methods; map is small and allocation is cheap relative to the RPC.
func (s *Service) labWriteHandlers() map[string]labWriteHandler {
	// Keep the set closed: every key must also be documented for recipe authors.
	return map[string]labWriteHandler{
		"sqs.send":      s.labWriteSQSSend,
		"dynamodb.put":  s.labWriteDynamoPut,
		"sns.publish":   s.labWriteSNSPublish,
		"lambda.invoke": s.labWriteLambdaInvoke,
		"logs.put":      s.labWriteLogsPut,
		"s3.upload":     s.labWriteS3Upload,
	}
}

func (s *Service) requireAWSWrite(
	session models.SessionSnapshot,
	deployment *deploy.Deployment,
	profile models.ProfileSummary,
	opLabel string,
) error {
	if deployment.ProviderID != "aws" {
		return fmt.Errorf("%s is only available for AWS deployments", opLabel)
	}
	if !effectiveAWSWritesEnabled(session, profile) {
		return fmt.Errorf("%s requires write mode to be enabled", opLabel)
	}
	return nil
}

func (s *Service) labWriteSQSSend(
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
	queueURL := strings.TrimSpace(params["queueUrl"])
	messageBody := params["messageBody"]
	if queueURL == "" {
		return nil, errors.New("queue URL is required")
	}
	if strings.TrimSpace(messageBody) == "" {
		return nil, errors.New("message body is required")
	}
	actionCtx, cancel := s.withAWSTimeout(ctx)
	defer cancel()
	return s.sqs.SendMessage(actionCtx, profile, region, queueURL, messageBody)
}

func (s *Service) labWriteDynamoPut(
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
	table := strings.TrimSpace(params["tableName"])
	itemJSON := params["itemJson"]
	if table == "" {
		return nil, errors.New("table name is required")
	}
	if strings.TrimSpace(itemJSON) == "" {
		return nil, errors.New("item JSON is required")
	}
	actionCtx, cancel := s.withAWSTimeout(ctx)
	defer cancel()
	return s.dynamodb.PutItem(actionCtx, profile, region, table, itemJSON)
}

func (s *Service) labWriteSNSPublish(
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
	topicArn := strings.TrimSpace(params["topicArn"])
	message := params["message"]
	if topicArn == "" {
		return nil, errors.New("topic ARN is required")
	}
	if strings.TrimSpace(message) == "" {
		return nil, errors.New("message is required")
	}
	actionCtx, cancel := s.withAWSTimeout(ctx)
	defer cancel()
	return s.sns.Publish(actionCtx, profile, region, topicArn, message)
}

func (s *Service) labWriteLambdaInvoke(
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
	functionName := strings.TrimSpace(params["functionName"])
	if functionName == "" {
		return nil, errors.New("function name is required")
	}
	payload := []byte("{}")
	if body := strings.TrimSpace(params["payload"]); body != "" {
		payload = []byte(body)
	}
	actionCtx, cancel := s.withAWSTimeout(ctx)
	defer cancel()
	return s.lambda.InvokeFunction(actionCtx, profile, region, functionName, payload)
}

func (s *Service) labWriteLogsPut(
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
	group := strings.TrimSpace(params["logGroupName"])
	if group == "" {
		return nil, errors.New("log group name is required")
	}
	message := strings.TrimSpace(params["message"])
	if message == "" {
		return nil, errors.New("message is required")
	}
	actionCtx, cancel := s.withAWSTimeout(ctx)
	defer cancel()
	return s.logs.PutLogEvents(actionCtx, profile, region, group, message)
}

func (s *Service) labWriteS3Upload(
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
	bucket := strings.TrimSpace(params["bucketName"])
	key := strings.TrimSpace(params["objectKey"])
	source := strings.TrimSpace(params["sourcePath"])
	if bucket == "" || key == "" || source == "" {
		return nil, errors.New("bucketName, objectKey, and sourcePath are required")
	}
	actionCtx, cancel := s.withAWSTimeout(ctx)
	defer cancel()
	return s.s3.UploadFile(actionCtx, profile, bucket, key, source)
}

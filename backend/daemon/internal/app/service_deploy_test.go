// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package app

import (
	"archive/zip"
	"context"
	"encoding/json"
	"errors"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	appdeployment "cloudsprocket/backend/daemon/internal/app/deployment"
	"cloudsprocket/backend/daemon/internal/config"
	"cloudsprocket/backend/daemon/internal/deploy"
	"cloudsprocket/backend/daemon/internal/policy"
	"cloudsprocket/backend/daemon/internal/recipes"
	"cloudsprocket/backend/daemon/internal/store"
	"cloudsprocket/backend/daemon/internal/tofu"
)

type fakeDeployer struct {
	available         bool
	plan              deploy.PlanSummary
	outputs           []deploy.Output
	postApplyErr      string
	retryPostApplyErr error
	planErr           error
	preflightErr      error
	policy            *policy.Evaluation
	// planBlocks makes Plan wait for context cancellation, modelling a
	// long-running tofu invocation so cancellation can be exercised.
	planBlocks  bool
	planStarted chan struct{}
}

func (f *fakeDeployer) Available() bool                         { return f.available }
func (f *fakeDeployer) Version(context.Context) (string, error) { return "1.12.2", nil }
func (f *fakeDeployer) BinaryPath() string                      { return "/fake/tofu" }
func (f *fakeDeployer) Install(context.Context) (string, error) {
	f.available = true
	return "1.12.2", nil
}
func (f *fakeDeployer) Preflight(context.Context, *deploy.Deployment) error { return f.preflightErr }
func (f *fakeDeployer) TargetLabel(deployment *deploy.Deployment) string {
	if deployment.Local {
		return "LocalStack"
	}
	return "AWS profile " + deployment.ProfileID
}
func (f *fakeDeployer) Prepare(*deploy.Deployment) error { return nil }

func (f *fakeDeployer) Plan(ctx context.Context, deployment *deploy.Deployment, onLine tofu.LogFunc) (deploy.PlanSummary, error) {
	if onLine != nil {
		onLine("Initialising the backend...")
	}
	if f.planBlocks {
		if f.planStarted != nil {
			close(f.planStarted)
		}
		<-ctx.Done()
		return deploy.PlanSummary{}, ctx.Err()
	}
	if onLine != nil {
		onLine("Plan: 10 to add, 0 to change, 0 to destroy.")
	}
	if f.policy != nil {
		copy := *f.policy
		copy.Findings = append([]policy.Finding(nil), f.policy.Findings...)
		deployment.Policy = &copy
	} else {
		deployment.Policy = &policy.Evaluation{
			Status:         policy.StatusPassed,
			PlanDigest:     "sha256:fake-plan",
			DecisionDigest: "sha256:fake-decision",
			Findings:       []policy.Finding{},
		}
	}
	return f.plan, f.planErr
}

func (f *fakeDeployer) Apply(_ context.Context, _ *deploy.Deployment, onLine tofu.LogFunc) (deploy.ApplyResult, error) {
	if onLine != nil {
		onLine("Applying...")
	}
	return deploy.ApplyResult{Outputs: f.outputs, PostApplyError: f.postApplyErr}, nil
}

func (f *fakeDeployer) RetryPostApply(_ context.Context, _ *deploy.Deployment, onLine tofu.LogFunc) error {
	if onLine != nil {
		onLine("Retrying post-apply...")
	}
	return f.retryPostApplyErr
}

func (f *fakeDeployer) Destroy(_ context.Context, _ *deploy.Deployment, _ tofu.LogFunc) error {
	return nil
}

func (f *fakeDeployer) CheckDrift(_ context.Context, _ *deploy.Deployment, onLine tofu.LogFunc) (deploy.DriftReport, error) {
	if onLine != nil {
		onLine("Checking for drift...")
	}
	return deploy.DriftReport{HasDrift: false}, nil
}

func (f *fakeDeployer) RemoveWorkspace(string) error { return nil }

func (f *fakeDeployer) ReleaseWorkspace(string) {}

type captureNotifier struct {
	mu     sync.Mutex
	events []capturedEvent
}

type capturedEvent struct {
	method  string
	payload any
}

func (c *captureNotifier) Notify(method string, payload any) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.events = append(c.events, capturedEvent{method: method, payload: payload})
	return nil
}

func (c *captureNotifier) count(method string) int {
	c.mu.Lock()
	defer c.mu.Unlock()
	n := 0
	for _, event := range c.events {
		if event.method == method {
			n++
		}
	}
	return n
}

func (c *captureNotifier) waitForDeploymentStatus(t *testing.T, id string, want deploy.Status) {
	t.Helper()
	deadline := time.Now().Add(10 * time.Second)
	var lastStatus deploy.Status
	for time.Now().Before(deadline) {
		if status, ok := c.deploymentStatus(id, want); ok {
			return
		} else if status != "" {
			lastStatus = status
		}
		time.Sleep(50 * time.Millisecond)
	}
	t.Fatalf("deployment %s did not emit status %q in time; last status: %q", id, want, lastStatus)
}

func (c *captureNotifier) deploymentStatus(id string, want deploy.Status) (deploy.Status, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	var lastStatus deploy.Status
	for _, event := range c.events {
		if event.method != "deployment.changed" {
			continue
		}
		deployment, ok := event.payload.(*deploy.Deployment)
		if !ok || deployment.ID != id {
			continue
		}
		lastStatus = deployment.Status
		if deployment.Status == want {
			return deployment.Status, true
		}
	}
	return lastStatus, false
}

func newDeployTestService(t *testing.T, deployer Deployer) *Service {
	t.Helper()
	dir := t.TempDir()
	settings := config.FromEnv(map[string]string{"CLOUDSPROCKET_CONFIG_DIR": dir}, "linux", dir)
	if err := settings.EnsureRuntimeDirs(); err != nil {
		t.Fatalf("EnsureRuntimeDirs: %v", err)
	}
	dataStore, err := store.Open(settings.DatabasePath)
	if err != nil {
		t.Fatalf("store.Open: %v", err)
	}
	t.Cleanup(func() { _ = dataStore.Close() })
	cipher, err := loadCipher(settings.SecretKeyPath)
	if err != nil {
		t.Fatalf("loadCipher: %v", err)
	}
	now := func() time.Time { return time.Now().UTC() }
	service := &Service{
		settings: settings,
		store:    dataStore,
		cipher:   cipher,
		now:      now,
	}
	service.deploy = appdeployment.New(appdeployment.Deps{
		Settings: settings,
		Store:    dataStore,
		Recipes:  recipes.Bundled().WithImportedDir(settings.ImportedRecipesDir),
		Deployer: deployer,
		Secrets:  deploySecretsAdapter{s: service},
		Now:      now,
	})
	return service
}

func waitForStatus(t *testing.T, s *Service, notifier *captureNotifier, id string, want deploy.Status) *deploy.Deployment {
	t.Helper()
	if notifier != nil {
		notifier.waitForDeploymentStatus(t, id, want)
	}
	deadline := time.Now().Add(2 * time.Second)
	var lastStatus deploy.Status
	var lastErr error
	for time.Now().Before(deadline) {
		deployment, err := s.deploymentGet(context.Background(), id)
		if err == nil && deployment.Status == want {
			return deployment
		}
		if err != nil {
			lastErr = err
		} else {
			lastStatus = deployment.Status
			lastErr = nil
		}
		time.Sleep(50 * time.Millisecond)
	}
	if lastErr != nil {
		t.Fatalf("deployment %s did not reach status %q in time; last error: %v", id, want, lastErr)
	}
	t.Fatalf("deployment %s did not reach status %q in time; last status: %q", id, want, lastStatus)
	return nil
}

func TestRecipesListHandler(t *testing.T) {
	s := newDeployTestService(t, &fakeDeployer{available: true})
	result, err := s.Handle(context.Background(), "recipes.list", nil, nil)
	if err != nil {
		t.Fatalf("recipes.list: %v", err)
	}
	manifests, ok := result.([]recipes.Manifest)
	if !ok || len(manifests) == 0 {
		t.Fatalf("unexpected result: %#v", result)
	}
}

func TestTofuStatusHandler(t *testing.T) {
	s := newDeployTestService(t, &fakeDeployer{available: true})
	result, err := s.Handle(context.Background(), "tofu.status", nil, nil)
	if err != nil {
		t.Fatalf("tofu.status: %v", err)
	}
	status := result.(tofuStatus)
	if !status.Available || status.Version != "1.12.2" {
		t.Fatalf("status = %+v", status)
	}
}

func TestDeploymentPlanLifecycle(t *testing.T) {
	deployer := &fakeDeployer{available: true, plan: deploy.PlanSummary{Add: 10}}
	s := newDeployTestService(t, deployer)
	notifier := &captureNotifier{}

	params := json.RawMessage(`{"recipeId":"serverless-fullstack-aws","name":"demo","providerId":"aws","local":true,"variables":{"app_name":"demo"}}`)
	result, err := s.Handle(context.Background(), "deployments.plan", params, notifier)
	if err != nil {
		t.Fatalf("deployments.plan: %v", err)
	}
	started := result.(deploymentJob)
	if started.Deployment == nil || started.Deployment.ID == "" {
		t.Fatalf("missing deployment in response: %#v", started)
	}

	planned := waitForStatus(t, s, notifier, started.Deployment.ID, deploy.StatusPlanned)
	if planned.Plan == nil || planned.Plan.Add != 10 {
		t.Fatalf("plan summary not persisted: %+v", planned.Plan)
	}
	if notifier.count("deployment.log") == 0 {
		t.Fatal("expected streamed deployment.log events")
	}
	if notifier.count("job.updated") == 0 {
		t.Fatal("expected job.updated events")
	}
	if notifier.count("deployment.changed") == 0 {
		t.Fatal("expected deployment.changed events")
	}

	// deployments.list and deployments.get reflect the stored record.
	listResult, err := s.Handle(context.Background(), "deployments.list", nil, nil)
	if err != nil {
		t.Fatalf("deployments.list: %v", err)
	}
	if list := listResult.([]deploy.Deployment); len(list) != 1 {
		t.Fatalf("expected 1 deployment, got %d", len(list))
	}
}

func TestDeploymentApplyRequiresAndAuditsPolicyOverride(t *testing.T) {
	blocked := &policy.Evaluation{
		Status:         policy.StatusBlocked,
		PlanDigest:     "sha256:fake-plan",
		DecisionDigest: "sha256:fake-decision",
		BlockingCount:  1,
		Findings: []policy.Finding{{
			RuleID:          "aws.s3.public-access",
			Severity:        policy.SeverityDeny,
			ResourceAddress: "aws_s3_bucket.site",
		}},
	}
	deployer := &fakeDeployer{available: true, plan: deploy.PlanSummary{Add: 1}, policy: blocked}
	s := newDeployTestService(t, deployer)
	notifier := &captureNotifier{}

	params := json.RawMessage(`{"recipeId":"serverless-fullstack-aws","name":"live-demo","providerId":"aws","profileId":"prod","local":false,"variables":{"app_name":"demo"}}`)
	result, err := s.Handle(context.Background(), "deployments.plan", params, notifier)
	if err != nil {
		t.Fatalf("deployments.plan: %v", err)
	}
	started := result.(deploymentJob)
	planned := waitForStatus(t, s, notifier, started.Deployment.ID, deploy.StatusPlanned)
	if planned.Policy == nil || planned.Policy.Status != policy.StatusBlocked {
		t.Fatalf("blocked policy result was not persisted: %+v", planned.Policy)
	}

	applyWithoutOverride := json.RawMessage(`{"deploymentId":"` + planned.ID + `"}`)
	if _, err := s.Handle(context.Background(), "deployments.apply", applyWithoutOverride, notifier); err == nil || !strings.Contains(err.Error(), policy.OverridePhrase(planned.ID)) {
		t.Fatalf("expected typed policy override error, got %v", err)
	}

	applyWithOverride, err := json.Marshal(map[string]string{
		"deploymentId":   planned.ID,
		"policyOverride": policy.OverridePhrase(planned.ID),
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := s.Handle(context.Background(), "deployments.apply", applyWithOverride, notifier); err != nil {
		t.Fatalf("deployments.apply with override: %v", err)
	}
	applied := waitForStatus(t, s, notifier, planned.ID, deploy.StatusApplied)
	if applied.Policy == nil || !applied.Policy.HasValidOverride() {
		t.Fatalf("policy override was not persisted: %+v", applied.Policy)
	}
	if notifier.count("log.appended") == 0 {
		t.Fatal("expected policy override to append an activity log event")
	}
}

func TestDeploymentPlanFailureMarksFailed(t *testing.T) {
	deployer := &fakeDeployer{available: true, planErr: context.DeadlineExceeded}
	s := newDeployTestService(t, deployer)
	notifier := &captureNotifier{}

	params := json.RawMessage(`{"recipeId":"serverless-fullstack-aws","providerId":"aws","local":true}`)
	result, err := s.Handle(context.Background(), "deployments.plan", params, notifier)
	if err != nil {
		t.Fatalf("deployments.plan: %v", err)
	}
	started := result.(deploymentJob)
	failed := waitForStatus(t, s, notifier, started.Deployment.ID, deploy.StatusFailed)
	if failed.Error == "" {
		t.Fatal("expected an error message on the failed deployment")
	}
}

func TestDeploymentPlanFailsFastWhenTargetUnreachable(t *testing.T) {
	deployer := &fakeDeployer{available: true, preflightErr: errors.New("LocalStack is not reachable at http://localhost:4566")}
	s := newDeployTestService(t, deployer)
	notifier := &captureNotifier{}

	params := json.RawMessage(`{"recipeId":"serverless-fullstack-aws","providerId":"aws","local":true}`)
	result, err := s.Handle(context.Background(), "deployments.plan", params, notifier)
	if err != nil {
		t.Fatalf("deployments.plan: %v", err)
	}
	started := result.(deploymentJob)
	failed := waitForStatus(t, s, notifier, started.Deployment.ID, deploy.StatusFailed)
	if !strings.Contains(failed.Error, "not reachable") {
		t.Fatalf("expected an unreachable-target error, got %q", failed.Error)
	}
}

func TestDeploymentCancelStopsRunningPlan(t *testing.T) {
	deployer := &fakeDeployer{available: true, planBlocks: true, planStarted: make(chan struct{})}
	s := newDeployTestService(t, deployer)
	notifier := &captureNotifier{}

	params := json.RawMessage(`{"recipeId":"serverless-fullstack-aws","providerId":"aws","local":true}`)
	result, err := s.Handle(context.Background(), "deployments.plan", params, notifier)
	if err != nil {
		t.Fatalf("deployments.plan: %v", err)
	}
	started := result.(deploymentJob)

	// Wait until the plan is actually running before cancelling.
	select {
	case <-deployer.planStarted:
	case <-time.After(5 * time.Second):
		t.Fatal("plan did not start in time")
	}

	cancelParams := json.RawMessage(`{"deploymentId":"` + started.Deployment.ID + `"}`)
	if _, err := s.Handle(context.Background(), "deployments.cancel", cancelParams, notifier); err != nil {
		t.Fatalf("deployments.cancel: %v", err)
	}

	cancelled := waitForStatus(t, s, notifier, started.Deployment.ID, deploy.StatusCancelled)
	if cancelled.Error != "" {
		t.Fatalf("a cancelled deployment should not carry an error, got %q", cancelled.Error)
	}
}

func TestDeploymentCancelWithoutRunningOperationErrors(t *testing.T) {
	s := newDeployTestService(t, &fakeDeployer{available: true})
	params := json.RawMessage(`{"deploymentId":"dep-does-not-exist"}`)
	if _, err := s.Handle(context.Background(), "deployments.cancel", params, nil); err == nil {
		t.Fatal("expected an error cancelling a deployment with no in-flight operation")
	}
}

func TestDeploymentCancelForcesStuckPlanningStatus(t *testing.T) {
	// Simulate a deployment left in planning with no cancel handle (hung preflight
	// after daemon lost the cancel map, or UI reopened a stuck record).
	s := newDeployTestService(t, &fakeDeployer{available: true})
	notifier := &captureNotifier{}
	deployment := &deploy.Deployment{
		ID:         "dep-stuck-plan",
		RecipeID:   "serverless-fullstack-aws",
		Name:       "stuck",
		ProviderID: "aws",
		Local:      true,
		RuntimeID:  "docker-compose",
		Status:     deploy.StatusPlanning,
		Variables:  map[string]any{},
		CreatedAt:  s.timestamp(),
		UpdatedAt:  s.timestamp(),
	}
	if err := s.saveDeployment(context.Background(), deployment, deployment.UpdatedAt); err != nil {
		t.Fatalf("seed stuck deployment: %v", err)
	}

	params := json.RawMessage(`{"deploymentId":"dep-stuck-plan"}`)
	if _, err := s.Handle(context.Background(), "deployments.cancel", params, notifier); err != nil {
		t.Fatalf("deployments.cancel: %v", err)
	}
	got, err := s.deploymentGet(context.Background(), "dep-stuck-plan")
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	if got.Status != deploy.StatusCancelled {
		t.Fatalf("status = %q, want cancelled", got.Status)
	}
	if notifier.count("deployment.changed") == 0 {
		t.Fatal("expected deployment.changed so the UI can drop the Stop button")
	}
}

func TestDeploymentDeleteRemovesPlannedRecord(t *testing.T) {
	deployer := &fakeDeployer{available: true, plan: deploy.PlanSummary{Add: 1}}
	s := newDeployTestService(t, deployer)
	notifier := &captureNotifier{}

	params := json.RawMessage(`{"recipeId":"serverless-fullstack-aws","providerId":"aws","local":true}`)
	result, err := s.Handle(context.Background(), "deployments.plan", params, notifier)
	if err != nil {
		t.Fatalf("deployments.plan: %v", err)
	}
	started := result.(deploymentJob)
	waitForStatus(t, s, notifier, started.Deployment.ID, deploy.StatusPlanned)

	delParams := json.RawMessage(`{"deploymentId":"` + started.Deployment.ID + `"}`)
	if _, err := s.Handle(context.Background(), "deployments.delete", delParams, nil); err != nil {
		t.Fatalf("deployments.delete: %v", err)
	}
	listResult, err := s.Handle(context.Background(), "deployments.list", nil, nil)
	if err != nil {
		t.Fatalf("deployments.list: %v", err)
	}
	if list := listResult.([]deploy.Deployment); len(list) != 0 {
		t.Fatalf("expected the deployment to be removed, got %d", len(list))
	}
}

func TestDeploymentDeleteRefusesAppliedRecord(t *testing.T) {
	deployer := &fakeDeployer{available: true}
	s := newDeployTestService(t, deployer)
	now := s.timestamp()
	applied := &deploy.Deployment{ID: deploy.NewID(), RecipeID: "serverless-fullstack-aws", Status: deploy.StatusApplied, CreatedAt: now, UpdatedAt: now}
	if err := s.store.SaveDeployment(context.Background(), applied.ID, applied, now); err != nil {
		t.Fatalf("SaveDeployment: %v", err)
	}
	delParams := json.RawMessage(`{"deploymentId":"` + applied.ID + `"}`)
	if _, err := s.Handle(context.Background(), "deployments.delete", delParams, nil); err == nil {
		t.Fatal("expected delete of an applied deployment to be refused")
	}
}

func TestDeploymentDeleteRefusesCancelledWithOutputs(t *testing.T) {
	deployer := &fakeDeployer{available: true}
	s := newDeployTestService(t, deployer)
	now := s.timestamp()
	cancelled := &deploy.Deployment{
		ID:        deploy.NewID(),
		RecipeID:  "serverless-fullstack-aws",
		Status:    deploy.StatusCancelled,
		Outputs:   []deploy.Output{{Name: "bucket", Value: "leftover"}},
		CreatedAt: now,
		UpdatedAt: now,
	}
	if err := s.store.SaveDeployment(context.Background(), cancelled.ID, cancelled, now); err != nil {
		t.Fatalf("SaveDeployment: %v", err)
	}
	delParams := json.RawMessage(`{"deploymentId":"` + cancelled.ID + `"}`)
	_, err := s.Handle(context.Background(), "deployments.delete", delParams, nil)
	if err == nil {
		t.Fatal("expected delete of a cancelled deployment with outputs to be refused")
	}
	if !strings.Contains(err.Error(), "destroy it before") {
		t.Fatalf("expected destroy-first error, got %v", err)
	}
}

func TestDeploymentDeleteRefusesFailedWithOutputs(t *testing.T) {
	deployer := &fakeDeployer{available: true}
	s := newDeployTestService(t, deployer)
	now := s.timestamp()
	failed := &deploy.Deployment{
		ID:        deploy.NewID(),
		RecipeID:  "serverless-fullstack-aws",
		Status:    deploy.StatusFailed,
		Outputs:   []deploy.Output{{Name: "bucket", Value: "leftover"}},
		CreatedAt: now,
		UpdatedAt: now,
	}
	if err := s.store.SaveDeployment(context.Background(), failed.ID, failed, now); err != nil {
		t.Fatalf("SaveDeployment: %v", err)
	}
	delParams := json.RawMessage(`{"deploymentId":"` + failed.ID + `"}`)
	_, err := s.Handle(context.Background(), "deployments.delete", delParams, nil)
	if err == nil {
		t.Fatal("expected delete of a failed deployment with outputs to be refused")
	}
	if !strings.Contains(err.Error(), "destroy it before") {
		t.Fatalf("expected destroy-first error, got %v", err)
	}
}

func TestDeploymentPlanAllowsCancelledUpdate(t *testing.T) {
	deployer := &fakeDeployer{available: true, plan: deploy.PlanSummary{Add: 0, Change: 1, Destroy: 0}}
	s := newDeployTestService(t, deployer)
	notifier := &captureNotifier{}
	now := s.timestamp()
	cancelled := &deploy.Deployment{
		ID:         deploy.NewID(),
		RecipeID:   "serverless-fullstack-aws",
		Name:       "leftover",
		ProviderID: "aws",
		Local:      true,
		Status:     deploy.StatusCancelled,
		Outputs:    []deploy.Output{{Name: "bucket", Value: "leftover"}},
		Variables:  map[string]any{"app_name": "leftover"},
		CreatedAt:  now,
		UpdatedAt:  now,
	}
	if err := s.saveDeployment(context.Background(), cancelled, now); err != nil {
		t.Fatalf("seed cancelled: %v", err)
	}

	updateParams := json.RawMessage(`{"recipeId":"serverless-fullstack-aws","name":"leftover","providerId":"aws","local":true,"variables":{"app_name":"leftover"},"updateDeploymentId":"` + cancelled.ID + `"}`)
	upRes, err := s.Handle(context.Background(), "deployments.plan", updateParams, notifier)
	if err != nil {
		t.Fatalf("plan cancelled update: %v", err)
	}
	upJob := upRes.(deploymentJob)
	if upJob.Deployment.ID != cancelled.ID {
		t.Fatalf("update must reuse id, got %s", upJob.Deployment.ID)
	}
	updated := waitForStatus(t, s, notifier, cancelled.ID, deploy.StatusPlanned)
	if updated.Plan == nil || updated.Plan.Change != 1 {
		t.Fatalf("expected re-plan on cancelled update, got %+v", updated.Plan)
	}
}

func TestDeploymentPlanRejectsUnknownRecipe(t *testing.T) {
	s := newDeployTestService(t, &fakeDeployer{available: true})
	params := json.RawMessage(`{"recipeId":"does-not-exist","providerId":"aws"}`)
	if _, err := s.Handle(context.Background(), "deployments.plan", params, nil); err == nil {
		t.Fatal("expected an error for an unknown recipe")
	}
}

// TestDeploymentUpdateFlow re-uses an applied deployment for B2 update: plan
// request with updateDeploymentId seeds from stored values and produces a new
// plan against the existing workspace/state.
func TestDeploymentUpdateFlow(t *testing.T) {
	deployer := &fakeDeployer{available: true, plan: deploy.PlanSummary{Add: 0, Change: 2, Destroy: 0}}
	s := newDeployTestService(t, deployer)
	notifier := &captureNotifier{}

	// First, create and "apply" a base deployment via plan then simulate applied.
	planParams := json.RawMessage(`{"recipeId":"serverless-fullstack-aws","name":"base","providerId":"aws","local":true,"variables":{"app_name":"base"}}`)
	res, err := s.Handle(context.Background(), "deployments.plan", planParams, notifier)
	if err != nil {
		t.Fatalf("initial plan: %v", err)
	}
	initial := res.(deploymentJob)
	planned := waitForStatus(t, s, notifier, initial.Deployment.ID, deploy.StatusPlanned)
	// Simulate applied state (as if apply succeeded) + set recipe version manually for test.
	planned.Status = deploy.StatusApplied
	planned.Outputs = []deploy.Output{{Name: "bucket", Value: "b"}}
	planned.RecipeVersion = "0.1.0"
	now := s.timestamp()
	if err := s.saveDeployment(context.Background(), planned, now); err != nil {
		t.Fatalf("seed applied: %v", err)
	}

	// Now request update plan on it (re-seed vars, e.g. change a value).
	updateParams := json.RawMessage(`{"recipeId":"serverless-fullstack-aws","name":"base","providerId":"aws","local":true,"variables":{"app_name":"updated"},"updateDeploymentId":"` + planned.ID + `"}`)
	upRes, err := s.Handle(context.Background(), "deployments.plan", updateParams, notifier)
	if err != nil {
		t.Fatalf("update plan: %v", err)
	}
	upJob := upRes.(deploymentJob)
	if upJob.Deployment.ID != planned.ID {
		t.Fatalf("update must reuse id, got %s", upJob.Deployment.ID)
	}
	updated := waitForStatus(t, s, notifier, planned.ID, deploy.StatusPlanned)
	if updated.Plan == nil || updated.Plan.Change != 2 {
		t.Fatalf("expected re-plan diff on update, got %+v", updated.Plan)
	}
	if len(updated.Revisions) != 1 {
		t.Fatalf("expected one revision snapshot, got %d", len(updated.Revisions))
	}
	if updated.RecipeVersion == "" {
		t.Fatal("expected recipeVersion to be recorded on update plan")
	}
}

func TestSafeRecipePathSegment(t *testing.T) {
	ok, err := safeRecipePathSegment("my-recipe", "id")
	if err != nil || ok != "my-recipe" {
		t.Fatalf("plain id: got %q err=%v", ok, err)
	}
	if _, err := safeRecipePathSegment("../../etc", "id"); err == nil {
		t.Fatal("expected rejection for traversal id")
	}
	if _, err := safeRecipePathSegment("a/b", "id"); err == nil {
		t.Fatal("expected rejection for slash in id")
	}
	if _, err := safeRecipePathSegment("", "id"); err == nil {
		t.Fatal("expected rejection for empty id")
	}
	// Base of nested path collapses; still reject if result is ..
	if _, err := safeRecipePathSegment("..", "version"); err == nil {
		t.Fatal("expected rejection for ..")
	}
}

func TestRecipesImportTrustGateAndPathSafety(t *testing.T) {
	deployer := &fakeDeployer{available: true}
	s := newDeployTestService(t, deployer)
	src := t.TempDir()
	// Valid manifest
	manifest := []byte("apiVersion: cloudsprocket.recipe/v1\nid: demo-import\nversion: 0.1.0\nname: Demo Import\nkind: app-deploy\nproviders: [\"aws\"]\nengine:\n  type: opentofu\n  minVersion: \"1.6.0\"\n")
	if err := os.WriteFile(filepath.Join(src, "recipe.yaml"), manifest, 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(src, "main.tf"), []byte("resource \"null_resource\" \"n\" {}"), 0o644); err != nil {
		t.Fatal(err)
	}
	// Hidden tooling that must not be copied
	if err := os.MkdirAll(filepath.Join(src, ".git"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(src, ".git", "config"), []byte("secret"), 0o644); err != nil {
		t.Fatal(err)
	}

	// Preview only: no copy
	res, err := s.Handle(context.Background(), "recipes.import", json.RawMessage(`{"sourcePath":`+mustJSON(src)+`}`), nil)
	if err != nil {
		t.Fatalf("preview: %v", err)
	}
	prev := res.(map[string]any)
	if prev["confirmed"] == true {
		t.Fatal("preview must not confirm")
	}
	if prev["ok"] != true {
		t.Fatalf("expected ok preview, got %+v", prev)
	}
	if prev["contentHash"] == nil || prev["contentHash"] == "" {
		t.Fatal("expected contentHash on preview")
	}
	dest := prev["importedPath"].(string)
	if _, err := os.Stat(dest); !os.IsNotExist(err) {
		t.Fatalf("preview must not create dest, stat err=%v", err)
	}

	// Confirm copies, skips .git, writes trust record
	confirmBody, _ := json.Marshal(map[string]any{"sourcePath": src, "confirm": true})
	res2, err := s.Handle(context.Background(), "recipes.import", confirmBody, nil)
	if err != nil {
		t.Fatalf("confirm: %v", err)
	}
	done := res2.(map[string]any)
	if done["confirmed"] != true {
		t.Fatal("confirm must set confirmed")
	}
	if _, err := os.Stat(filepath.Join(dest, "recipe.yaml")); err != nil {
		t.Fatalf("expected recipe.yaml at dest: %v", err)
	}
	if _, err := os.Stat(filepath.Join(dest, ".import-trust.json")); err != nil {
		t.Fatalf("expected trust record: %v", err)
	}
	if _, err := os.Stat(filepath.Join(dest, ".git")); !os.IsNotExist(err) {
		t.Fatal(".git must not be copied")
	}

	// Path traversal via crafted id
	bad := t.TempDir()
	badManifest := []byte("apiVersion: cloudsprocket.recipe/v1\nid: ../../evil\nversion: 0.1.0\nname: Evil\nkind: app-deploy\nproviders: [\"aws\"]\nengine:\n  type: opentofu\n  minVersion: \"1.6.0\"\n")
	if err := os.WriteFile(filepath.Join(bad, "recipe.yaml"), badManifest, 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(bad, "main.tf"), []byte("resource \"null_resource\" \"n\" {}"), 0o644); err != nil {
		t.Fatal(err)
	}
	_, err = s.Handle(context.Background(), "recipes.import", json.RawMessage(`{"sourcePath":`+mustJSON(bad)+`,"confirm":true}`), nil)
	if err == nil {
		t.Fatal("expected path traversal reject")
	}
}

func TestRecipesValidateRPC(t *testing.T) {
	deployer := &fakeDeployer{available: true}
	s := newDeployTestService(t, deployer)
	src := t.TempDir()
	manifest := []byte("apiVersion: cloudsprocket.recipe/v1\nid: validate-demo\nversion: 0.1.0\nname: Validate Demo\nkind: app-deploy\nproviders: [\"aws\"]\nengine:\n  type: opentofu\n")
	if err := os.WriteFile(filepath.Join(src, "recipe.yaml"), manifest, 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(src, "main.tf"), []byte("resource \"null_resource\" \"n\" {}"), 0o644); err != nil {
		t.Fatal(err)
	}
	res, err := s.Handle(context.Background(), "recipes.validate", json.RawMessage(`{"sourcePath":`+mustJSON(src)+`}`), nil)
	if err != nil {
		t.Fatalf("validate: %v", err)
	}
	report := res.(recipes.ValidationReport)
	if !report.OK {
		t.Fatalf("expected ok, findings=%+v", report.Findings)
	}
}

// TestImportedRecipeAppearsInCatalogue guards Claude P0: confirm import must surface
// in recipes.list with source=imported (bundled-only loader regressions).
func TestImportedRecipeAppearsInCatalogue(t *testing.T) {
	deployer := &fakeDeployer{available: true}
	s := newDeployTestService(t, deployer)
	src := t.TempDir()
	manifest := []byte("apiVersion: cloudsprocket.recipe/v1\nid: catalogue-import-demo\nversion: 0.1.0\nname: Catalogue Import Demo\nkind: app-deploy\nproviders: [\"aws\"]\nengine:\n  type: opentofu\n")
	if err := os.WriteFile(filepath.Join(src, "recipe.yaml"), manifest, 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(src, "main.tf"), []byte("resource \"null_resource\" \"n\" {}"), 0o644); err != nil {
		t.Fatal(err)
	}
	body, _ := json.Marshal(map[string]any{"sourcePath": src, "confirm": true})
	if _, err := s.Handle(context.Background(), "recipes.import", body, nil); err != nil {
		t.Fatalf("import confirm: %v", err)
	}
	listRes, err := s.Handle(context.Background(), "recipes.list", nil, nil)
	if err != nil {
		t.Fatalf("recipes.list: %v", err)
	}
	list, ok := listRes.([]recipes.Manifest)
	if !ok {
		t.Fatalf("unexpected list type %T", listRes)
	}
	found := false
	for _, m := range list {
		if m.ID == "catalogue-import-demo" {
			found = true
			if m.Source != recipes.SourceImported {
				t.Fatalf("source = %q, want imported", m.Source)
			}
		}
	}
	if !found {
		t.Fatal("imported recipe missing from recipes.list after confirm")
	}
	// Load must also resolve the import for deploy materialise.
	if _, err := s.Handle(context.Background(), "recipes.get", json.RawMessage(`{"recipeId":"catalogue-import-demo"}`), nil); err != nil {
		t.Fatalf("recipes.get imported: %v", err)
	}
}

// TestCheckDriftRejectsPendingStatus guards status gate + ctx path for drift.
func TestCheckDriftRejectsPendingStatus(t *testing.T) {
	deployer := &fakeDeployer{available: true}
	s := newDeployTestService(t, deployer)
	// Seed a pending deployment directly in the store.
	now := s.timestamp()
	dep := &deploy.Deployment{
		ID:         "dep-pending-drift",
		RecipeID:   "serverless-fullstack-aws",
		Name:       "pending",
		ProviderID: "aws",
		Local:      true,
		Status:     deploy.StatusPending,
		CreatedAt:  now,
		UpdatedAt:  now,
	}
	if err := s.saveDeployment(context.Background(), dep, now); err != nil {
		t.Fatalf("seed: %v", err)
	}
	_, err := s.Handle(context.Background(), "deployments.checkDrift", json.RawMessage(`{"deploymentId":"dep-pending-drift"}`), nil)
	if err == nil {
		t.Fatal("expected drift check to reject pending status")
	}
}

func TestRecipesValidateRejectsBlankPath(t *testing.T) {
	deployer := &fakeDeployer{available: true}
	s := newDeployTestService(t, deployer)
	_, err := s.Handle(context.Background(), "recipes.validate", json.RawMessage(`{"sourcePath":""}`), nil)
	if err == nil {
		t.Fatal("expected blank sourcePath to error")
	}
}

func TestRecipesImportZip(t *testing.T) {
	deployer := &fakeDeployer{available: true}
	s := newDeployTestService(t, deployer)
	src := t.TempDir()
	manifest := []byte("apiVersion: cloudsprocket.recipe/v1\nid: zip-demo\nversion: 0.1.0\nname: Zip Demo\nkind: app-deploy\nproviders: [\"aws\"]\nengine:\n  type: opentofu\n")
	if err := os.WriteFile(filepath.Join(src, "recipe.yaml"), manifest, 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(src, "main.tf"), []byte("resource \"null_resource\" \"n\" {}"), 0o644); err != nil {
		t.Fatal(err)
	}
	zipPath := filepath.Join(t.TempDir(), "recipe.zip")
	if err := zipDir(src, zipPath); err != nil {
		t.Fatalf("zipDir: %v", err)
	}
	body, _ := json.Marshal(map[string]any{"sourcePath": zipPath, "sourceType": "zip", "confirm": true})
	res, err := s.Handle(context.Background(), "recipes.import", body, nil)
	if err != nil {
		t.Fatalf("import zip: %v", err)
	}
	done := res.(map[string]any)
	if done["confirmed"] != true {
		t.Fatalf("expected confirmed zip import, got %+v", done)
	}
	dest := done["importedPath"].(string)
	if _, err := os.Stat(filepath.Join(dest, "recipe.yaml")); err != nil {
		t.Fatalf("expected imported recipe: %v", err)
	}
}

func TestRecipesScaffoldReportsWriteErrors(t *testing.T) {
	deployer := &fakeDeployer{available: true}
	s := newDeployTestService(t, deployer)
	// Use a path that cannot be created as a writable directory on Windows/Unix:
	// a file path as destDir after creating a file there.
	base := t.TempDir()
	blocked := filepath.Join(base, "not-a-dir")
	if err := os.WriteFile(blocked, []byte("x"), 0o644); err != nil {
		t.Fatal(err)
	}
	body, _ := json.Marshal(map[string]string{"destDir": blocked, "provider": "aws"})
	_, err := s.Handle(context.Background(), "recipes.scaffold", body, nil)
	if err == nil {
		t.Fatal("expected scaffold error when destDir is a file")
	}
}

func mustJSON(s string) string {
	b, _ := json.Marshal(s)
	return string(b)
}

func zipDir(src, dest string) error {
	f, err := os.Create(dest)
	if err != nil {
		return err
	}
	defer f.Close()
	w := zip.NewWriter(f)
	defer w.Close()
	return filepath.WalkDir(src, func(path string, d fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		rel, err := filepath.Rel(src, path)
		if err != nil {
			return err
		}
		if rel == "." {
			return nil
		}
		name := filepath.ToSlash(rel)
		if d.IsDir() {
			_, err := w.Create(name + "/")
			return err
		}
		b, err := os.ReadFile(path)
		if err != nil {
			return err
		}
		fw, err := w.Create(name)
		if err != nil {
			return err
		}
		_, err = fw.Write(b)
		return err
	})
}

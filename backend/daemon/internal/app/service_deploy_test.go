// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package app

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"sync"
	"testing"
	"time"

	"cloudsprocket/backend/daemon/internal/config"
	"cloudsprocket/backend/daemon/internal/deploy"
	"cloudsprocket/backend/daemon/internal/recipes"
	"cloudsprocket/backend/daemon/internal/store"
	"cloudsprocket/backend/daemon/internal/tofu"
)

type fakeDeployer struct {
	available       bool
	plan            deploy.PlanSummary
	outputs         []deploy.Output
	postApplyErr    string
	retryPostApplyErr error
	planErr         error
	preflightErr    error
	// planBlocks makes Plan wait for context cancellation, modelling a
	// long-running tofu invocation so cancellation can be exercised.
	planBlocks bool
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

func (f *fakeDeployer) Plan(ctx context.Context, _ *deploy.Deployment, onLine tofu.LogFunc) (deploy.PlanSummary, error) {
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

func (f *fakeDeployer) CheckDrift(_ context.Context, _ *deploy.Deployment, _ tofu.LogFunc) (deploy.DriftReport, error) {
	return deploy.DriftReport{}, nil
}

func (f *fakeDeployer) RemoveWorkspace(string) error { return nil }

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
	return &Service{
		settings: settings,
		store:    dataStore,
		recipes:  recipes.Bundled(),
		deployer: deployer,
		now:      func() time.Time { return time.Now().UTC() },
	}
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

func TestDeploymentPlanRejectsUnknownRecipe(t *testing.T) {
	s := newDeployTestService(t, &fakeDeployer{available: true})
	params := json.RawMessage(`{"recipeId":"does-not-exist","providerId":"aws"}`)
	if _, err := s.Handle(context.Background(), "deployments.plan", params, nil); err == nil {
		t.Fatal("expected an error for an unknown recipe")
	}
}

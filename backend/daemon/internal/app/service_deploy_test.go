package app

import (
	"context"
	"encoding/json"
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
	available bool
	plan      deploy.PlanSummary
	outputs   []deploy.Output
	planErr   error
}

func (f *fakeDeployer) Available() bool                         { return f.available }
func (f *fakeDeployer) Version(context.Context) (string, error) { return "1.12.2", nil }
func (f *fakeDeployer) BinaryPath() string                      { return "/fake/tofu" }
func (f *fakeDeployer) Install(context.Context) (string, error) {
	f.available = true
	return "1.12.2", nil
}
func (f *fakeDeployer) Prepare(*deploy.Deployment) error { return nil }

func (f *fakeDeployer) Plan(_ context.Context, _ *deploy.Deployment, onLine tofu.LogFunc) (deploy.PlanSummary, error) {
	if onLine != nil {
		onLine("Initialising the backend...")
		onLine("Plan: 10 to add, 0 to change, 0 to destroy.")
	}
	return f.plan, f.planErr
}

func (f *fakeDeployer) Apply(_ context.Context, _ *deploy.Deployment, onLine tofu.LogFunc) ([]deploy.Output, error) {
	if onLine != nil {
		onLine("Applying...")
	}
	return f.outputs, nil
}

func (f *fakeDeployer) Destroy(_ context.Context, _ *deploy.Deployment, _ tofu.LogFunc) error {
	return nil
}

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

func waitForStatus(t *testing.T, s *Service, id string, want deploy.Status) *deploy.Deployment {
	t.Helper()
	deadline := time.Now().Add(10 * time.Second)
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
		time.Sleep(10 * time.Millisecond)
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

	planned := waitForStatus(t, s, started.Deployment.ID, deploy.StatusPlanned)
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

	params := json.RawMessage(`{"recipeId":"serverless-fullstack-aws","providerId":"aws","local":true}`)
	result, err := s.Handle(context.Background(), "deployments.plan", params, &captureNotifier{})
	if err != nil {
		t.Fatalf("deployments.plan: %v", err)
	}
	started := result.(deploymentJob)
	failed := waitForStatus(t, s, started.Deployment.ID, deploy.StatusFailed)
	if failed.Error == "" {
		t.Fatal("expected an error message on the failed deployment")
	}
}

func TestDeploymentPlanRejectsUnknownRecipe(t *testing.T) {
	s := newDeployTestService(t, &fakeDeployer{available: true})
	params := json.RawMessage(`{"recipeId":"does-not-exist","providerId":"aws"}`)
	if _, err := s.Handle(context.Background(), "deployments.plan", params, nil); err == nil {
		t.Fatal("expected an error for an unknown recipe")
	}
}

// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package labs

import (
	"context"
	"encoding/json"
	"errors"
	"sync"
	"testing"

	"cloudsprocket/backend/daemon/internal/app/sessionport"
	"cloudsprocket/backend/daemon/internal/deploy"
	"cloudsprocket/backend/daemon/internal/discovery"
	"cloudsprocket/backend/daemon/internal/labs"
	"cloudsprocket/backend/daemon/internal/models"
	"cloudsprocket/backend/daemon/internal/recipes"
)

type fakeDiscovery struct {
	snapshot discovery.Snapshot
	err      error
}

func (f fakeDiscovery) Discover() (discovery.Snapshot, error) {
	return f.snapshot, f.err
}

type fakeSession struct {
	mu      sync.Mutex
	session models.SessionSnapshot
}

func (f *fakeSession) Load(_ context.Context, _ discovery.Snapshot) (models.SessionSnapshot, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.session, nil
}

func (f *fakeSession) Update(_ context.Context, _ discovery.Snapshot, mutate func(*models.SessionSnapshot) error) (models.SessionSnapshot, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if mutate != nil {
		if err := mutate(&f.session); err != nil {
			return models.SessionSnapshot{}, err
		}
	}
	return f.session, nil
}

type fakeInvalidator struct {
	runtime int
}

func (f *fakeInvalidator) InvalidateRuntimeStatus() { f.runtime++ }
func (f *fakeInvalidator) InvalidateAzureCLIExtensionCache() {
}
func (f *fakeInvalidator) InvalidateCloudResourceCaches(context.Context) {}
func (f *fakeInvalidator) InvalidateResourceCache(context.Context, string, string) {
}
func (f *fakeInvalidator) InvalidateResourceCacheScope(context.Context, string) {}

type fakeDeployments struct {
	byID map[string]*deploy.Deployment
	list []deploy.Deployment
	err  error
}

func (f fakeDeployments) List(context.Context) ([]deploy.Deployment, error) {
	if f.err != nil {
		return nil, f.err
	}
	return f.list, nil
}

func (f fakeDeployments) Get(_ context.Context, id string) (*deploy.Deployment, error) {
	if f.err != nil {
		return nil, f.err
	}
	deployment, ok := f.byID[id]
	if !ok {
		return nil, errors.New("deployment not found")
	}
	return deployment, nil
}

type fakeRecipes struct {
	byID map[string]recipes.Recipe
	err  error
}

func (f fakeRecipes) Load(id string) (recipes.Recipe, error) {
	if f.err != nil {
		return recipes.Recipe{}, f.err
	}
	recipe, ok := f.byID[id]
	if !ok {
		return recipes.Recipe{}, errors.New("recipe not found")
	}
	return recipe, nil
}

type fakeRunner struct {
	mu        sync.Mutex
	sessions  map[string]labs.LabSession
	started   int
	recovered []string
}

func (f *fakeRunner) Start(_ context.Context, lab *recipes.LabSpec, deployment *deploy.Deployment) (labs.LabSession, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.started++
	session := labs.LabSession{
		DeploymentID:  deployment.ID,
		RecipeID:      deployment.RecipeID,
		Status:        labs.SessionStatusInProgress,
		CurrentStepID: lab.Steps[0].ID,
		Steps:         []labs.StepState{{StepID: lab.Steps[0].ID, Status: labs.StepStatusInProgress}},
	}
	if f.sessions == nil {
		f.sessions = map[string]labs.LabSession{}
	}
	f.sessions[deployment.ID] = session
	return session, nil
}

func (f *fakeRunner) Get(_ context.Context, deploymentID string) (labs.LabSession, bool, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	session, ok := f.sessions[deploymentID]
	return session, ok, nil
}

func (f *fakeRunner) VerifyStep(
	_ context.Context,
	_ *recipes.LabSpec,
	deployment *deploy.Deployment,
	_ string,
	_ models.ProfileSummary,
	_ string,
	_ labs.VerifyOptions,
) (labs.LabSession, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	session, ok := f.sessions[deployment.ID]
	if !ok {
		return labs.LabSession{}, errors.New("lab session has not been started for this deployment")
	}
	return session, nil
}

func (f *fakeRunner) RunAction(
	context.Context,
	*recipes.LabSpec,
	*deploy.Deployment,
	string,
	int,
	models.ProfileSummary,
	string,
	WriteInvoker,
) (any, error) {
	return nil, errors.New("not implemented in fake")
}

func (f *fakeRunner) Reset(ctx context.Context, lab *recipes.LabSpec, deployment *deploy.Deployment) (labs.LabSession, error) {
	f.mu.Lock()
	if f.sessions != nil {
		delete(f.sessions, deployment.ID)
	}
	f.mu.Unlock()
	return f.Start(ctx, lab, deployment)
}

func (f *fakeRunner) RecoverActiveFault(_ context.Context, deployment *deploy.Deployment) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.recovered = append(f.recovered, deployment.ID)
	return nil
}

type fakeNotifier struct {
	mu     sync.Mutex
	events []string
}

func (n *fakeNotifier) Notify(method string, _ any) error {
	n.mu.Lock()
	defer n.mu.Unlock()
	n.events = append(n.events, method)
	return nil
}

func testLabRecipe() recipes.Recipe {
	return recipes.Recipe{
		Manifest: recipes.Manifest{
			ID: "recipe-lab",
			Lab: &recipes.LabSpec{
				Steps: []recipes.LabStep{{ID: "intro", Title: "Intro"}},
			},
		},
	}
}

func TestHandleStart(t *testing.T) {
	t.Parallel()
	deployment := &deploy.Deployment{
		ID:         "dep-1",
		RecipeID:   "recipe-lab",
		ProviderID: "aws",
		ProfileID:  "local",
		Status:     deploy.StatusApplied,
	}
	runner := &fakeRunner{}
	notifier := &fakeNotifier{}
	svc := New(Deps{
		Discovery: fakeDiscovery{},
		Session:   &fakeSession{},
		Deployments: fakeDeployments{
			byID: map[string]*deploy.Deployment{"dep-1": deployment},
		},
		Recipes: fakeRecipes{
			byID: map[string]recipes.Recipe{"recipe-lab": testLabRecipe()},
		},
		Runner: runner,
	})

	params, _ := json.Marshal(map[string]string{"deploymentId": "dep-1"})
	result, err := svc.HandleStart(context.Background(), params, notifier)
	if err != nil {
		t.Fatalf("HandleStart: %v", err)
	}
	session, ok := result.(labs.LabSession)
	if !ok {
		t.Fatalf("expected LabSession, got %T", result)
	}
	if session.DeploymentID != "dep-1" {
		t.Fatalf("deploymentId = %q", session.DeploymentID)
	}
	if runner.started != 1 {
		t.Fatalf("started = %d", runner.started)
	}
	if len(notifier.events) != 1 || notifier.events[0] != "lab.changed" {
		t.Fatalf("events = %#v", notifier.events)
	}
}

func TestHandleGetMissingSession(t *testing.T) {
	t.Parallel()
	svc := New(Deps{
		Runner: &fakeRunner{},
	})
	params, _ := json.Marshal(map[string]string{"deploymentId": "missing"})
	_, err := svc.HandleGet(context.Background(), params, nil)
	if err == nil {
		t.Fatal("expected missing session error")
	}
}

func TestRecoverActiveFaults(t *testing.T) {
	t.Parallel()
	runner := &fakeRunner{}
	invalidator := &fakeInvalidator{}
	svc := New(Deps{
		Deployments: fakeDeployments{
			list: []deploy.Deployment{{ID: "dep-a"}, {ID: "dep-b"}},
		},
		Runner:      runner,
		Invalidator: invalidator,
	})
	if err := svc.RecoverActiveFaults(context.Background()); err != nil {
		t.Fatalf("RecoverActiveFaults: %v", err)
	}
	if len(runner.recovered) != 2 {
		t.Fatalf("recovered = %#v", runner.recovered)
	}
	if invalidator.runtime != 2 {
		t.Fatalf("runtime invalidations = %d", invalidator.runtime)
	}
}

// Ensure fakeNotifier satisfies sessionport.Notifier.
var _ sessionport.Notifier = (*fakeNotifier)(nil)

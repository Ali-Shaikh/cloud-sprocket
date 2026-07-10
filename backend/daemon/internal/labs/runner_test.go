// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package labs

import (
	"context"
	"encoding/json"
	"errors"
	"sync"
	"testing"
	"time"

	"cloudsprocket/backend/daemon/internal/deploy"
	"cloudsprocket/backend/daemon/internal/models"
	"cloudsprocket/backend/daemon/internal/recipes"
)

type memorySettingStore struct {
	mu   sync.Mutex
	data map[string][]byte
}

func (m *memorySettingStore) SaveAppSetting(_ context.Context, key string, value any) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.data == nil {
		m.data = map[string][]byte{}
	}
	if value == nil {
		delete(m.data, key)
		return nil
	}
	payload, err := json.Marshal(value)
	if err != nil {
		return err
	}
	m.data[key] = payload
	return nil
}

func (m *memorySettingStore) LoadAppSetting(_ context.Context, key string, target any) (bool, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	payload, ok := m.data[key]
	if !ok {
		return false, nil
	}
	return true, json.Unmarshal(payload, target)
}

type fakeCheck struct {
	checkType string
	result    VerifyResult
	err       error
}

func (f *fakeCheck) Type() string { return f.checkType }

func (f *fakeCheck) Run(_ context.Context, _ recipes.LabVerify, _ CheckContext) (VerifyResult, error) {
	if f.err != nil {
		return VerifyResult{}, f.err
	}
	return f.result, nil
}

func TestRunnerStartVerifyAndReset(t *testing.T) {
	now := time.Date(2026, 7, 8, 12, 0, 0, 0, time.UTC)
	store := NewSessionStore(&memorySettingStore{})
	registry := NewRegistry(&fakeCheck{
		checkType: recipes.LabVerifySQSQueueAttribute,
		result: VerifyResult{
			Type:    recipes.LabVerifySQSQueueAttribute,
			Passed:  true,
			Message: "ok",
		},
	})
	runner := NewRunner(store, registry, func() time.Time { return now })

	lab := &recipes.LabSpec{
		Steps: []recipes.LabStep{
			{ID: "send-message", Title: "Send", Verify: []recipes.LabVerify{{
				Type:      recipes.LabVerifySQSQueueAttribute,
				Queue:     "{{ outputs.queue_url }}",
				Attribute: "ApproximateNumberOfMessages",
				Compare:   "gte",
				Value:     "0",
			}}},
			{ID: "inspect", Title: "Inspect"},
		},
	}
	deployment := &deploy.Deployment{
		ID:       "dep-1",
		RecipeID: "lab-queue-worker-aws",
		Status:   deploy.StatusApplied,
		Outputs: []deploy.Output{
			{Name: "queue_url", Value: "https://sqs.example/queue"},
		},
	}

	ctx := context.Background()
	started, err := runner.Start(ctx, lab, deployment)
	if err != nil {
		t.Fatalf("Start: %v", err)
	}
	if started.CurrentStepID != "send-message" {
		t.Fatalf("CurrentStepID = %q", started.CurrentStepID)
	}
	if started.Status != SessionStatusInProgress {
		t.Fatalf("Status = %q, want in_progress", started.Status)
	}
	if len(started.Steps) == 0 || started.Steps[0].VerifyResults == nil {
		t.Fatal("fresh lab steps should include an empty verifyResults slice")
	}

	verified, err := runner.VerifyStep(
		ctx,
		lab,
		deployment,
		"send-message",
		models.ProfileSummary{ProfileID: "default"},
		"us-east-1",
	)
	if err != nil {
		t.Fatalf("VerifyStep: %v", err)
	}
	if verified.CurrentStepID != "inspect" {
		t.Fatalf("CurrentStepID = %q, want inspect", verified.CurrentStepID)
	}
	if verified.Status == SessionStatusCompleted {
		t.Fatal("lab should not be completed after first step")
	}
	if verified.Steps[0].Status != StepStatusPassed {
		t.Fatalf("first step status = %q, want passed", verified.Steps[0].Status)
	}

	reset, err := runner.Reset(ctx, lab, deployment)
	if err != nil {
		t.Fatalf("Reset: %v", err)
	}
	if reset.Status == SessionStatusCompleted {
		t.Fatal("reset session should not be completed")
	}
	if reset.CurrentStepID != "send-message" {
		t.Fatalf("reset CurrentStepID = %q", reset.CurrentStepID)
	}
}

func TestRunnerVerifyStepRecordsCheckError(t *testing.T) {
	store := NewSessionStore(&memorySettingStore{})
	registry := NewRegistry(&fakeCheck{
		checkType: recipes.LabVerifySQSQueueAttribute,
		err:       errors.New("adapter boom"),
	})
	runner := NewRunner(store, registry, func() time.Time { return time.Now().UTC() })
	lab := &recipes.LabSpec{
		Steps: []recipes.LabStep{{
			ID: "send-message",
			Title: "Send",
			Verify: []recipes.LabVerify{{
				Type:      recipes.LabVerifySQSQueueAttribute,
				Queue:     "{{ outputs.queue_url }}",
				Attribute: "ApproximateNumberOfMessages",
				Compare:   "gte",
				Value:     "1",
			}},
		}},
	}
	deployment := &deploy.Deployment{ID: "dep-1", RecipeID: "lab-demo", Status: deploy.StatusApplied}
	ctx := context.Background()
	if _, err := runner.Start(ctx, lab, deployment); err != nil {
		t.Fatalf("Start: %v", err)
	}
	verified, err := runner.VerifyStep(ctx, lab, deployment, "send-message", models.ProfileSummary{}, "us-east-1")
	if err != nil {
		t.Fatalf("VerifyStep should not abort: %v", err)
	}
	if verified.Steps[0].Status != StepStatusFailed {
		t.Fatalf("status = %q, want failed", verified.Steps[0].Status)
	}
	if len(verified.Steps[0].VerifyResults) != 1 || verified.Steps[0].VerifyResults[0].Passed {
		t.Fatalf("expected one failed verify result, got %+v", verified.Steps[0].VerifyResults)
	}
	if verified.Steps[0].VerifyResults[0].Detail == "" {
		t.Fatal("expected error detail on verify result")
	}
}

type trackingInjector struct {
	injected bool
	reverted bool
}

func (t *trackingInjector) Capabilities() []deploy.FaultKind {
	return []deploy.FaultKind{deploy.FaultKindPause}
}

func (t *trackingInjector) Inject(_ context.Context, _ deploy.Fault) (func() error, error) {
	t.injected = true
	return func() error {
		t.reverted = true
		return nil
	}, nil
}

func TestRunnerVerifyStepInjectsAndRevertsFault(t *testing.T) {
	store := NewSessionStore(&memorySettingStore{})
	registry := NewRegistry()
	runner := NewRunner(store, registry, func() time.Time { return time.Now().UTC() })
	tracker := &trackingInjector{}
	runner.injectorFor = func(_ *deploy.Deployment) deploy.FaultInjector { return tracker }

	lab := &recipes.LabSpec{
		Steps: []recipes.LabStep{{
			ID:    "chaos",
			Title: "Pause worker",
			Fault: &recipes.LabFault{Kind: string(deploy.FaultKindPause), Target: "worker"},
		}},
	}
	deployment := &deploy.Deployment{
		ID:        "dep-chaos",
		Status:    deploy.StatusApplied,
		Local:     true,
		RuntimeID: "docker-compose",
	}
	ctx := context.Background()
	if _, err := runner.Start(ctx, lab, deployment); err != nil {
		t.Fatalf("Start: %v", err)
	}
	if _, err := runner.VerifyStep(ctx, lab, deployment, "chaos", models.ProfileSummary{}, "us-east-1"); err != nil {
		t.Fatalf("VerifyStep: %v", err)
	}
	if !tracker.injected {
		t.Fatal("expected fault inject during verify")
	}
	if !tracker.reverted {
		t.Fatal("expected fault revert after verify")
	}
}

func TestRunnerRunActionOpenTab(t *testing.T) {
	store := NewSessionStore(&memorySettingStore{})
	runner := NewRunner(store, NewRegistry(), func() time.Time { return time.Now().UTC() })
	lab := &recipes.LabSpec{
		Steps: []recipes.LabStep{{
			ID:    "explore",
			Title: "Explore",
			Actions: []recipes.LabAction{{
				Type:  recipes.LabActionOpenTab,
				Tab:   "aws-sqs",
				Focus: "{{ outputs.queue_url }}",
			}},
		}},
	}
	deployment := &deploy.Deployment{
		ID:     "dep-2",
		Status: deploy.StatusApplied,
		Outputs: []deploy.Output{
			{Name: "queue_url", Value: "https://sqs.example/queue"},
		},
	}
	ctx := context.Background()
	if _, err := runner.Start(ctx, lab, deployment); err != nil {
		t.Fatalf("Start: %v", err)
	}
	result, err := runner.RunAction(ctx, lab, deployment, "explore", 0, models.ProfileSummary{}, "us-east-1", nil)
	if err != nil {
		t.Fatalf("RunAction: %v", err)
	}
	action, ok := result.(OpenTabAction)
	if !ok {
		t.Fatalf("result type = %T", result)
	}
	if action.Tab != "aws-sqs" || action.Focus != "https://sqs.example/queue" {
		t.Fatalf("action = %+v", action)
	}
}
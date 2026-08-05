// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package labs

import (
	"encoding/json"
	"strings"
	"testing"

	"cloudsprocket/backend/daemon/internal/deploy"
	"cloudsprocket/backend/daemon/internal/discovery"
	"cloudsprocket/backend/daemon/internal/models"
	"cloudsprocket/backend/daemon/internal/recipes"
)

type trackedHTTPBody struct {
	reader *strings.Reader
	closed bool
}

func (b *trackedHTTPBody) Read(buffer []byte) (int, error) {
	return b.reader.Read(buffer)
}

func (b *trackedHTTPBody) Close() error {
	b.closed = true
	return nil
}

func TestDrainAndCloseHTTPBody(t *testing.T) {
	t.Parallel()
	body := &trackedHTTPBody{reader: strings.NewReader("health response")}

	DrainAndCloseHTTPBody(body)
	if body.reader.Len() != 0 {
		t.Fatalf("response body has %d unread bytes", body.reader.Len())
	}
	if !body.closed {
		t.Fatal("response body was not closed")
	}
}

func TestFindLabStepSpec(t *testing.T) {
	t.Parallel()
	spec := &recipes.LabSpec{
		Steps: []recipes.LabStep{
			{ID: "step-a"},
			{ID: "step-b"},
		},
	}
	step, ok := FindLabStepSpec(spec, "step-b")
	if !ok || step.ID != "step-b" {
		t.Fatalf("expected step-b, got ok=%v id=%q", ok, step.ID)
	}
	if _, ok := FindLabStepSpec(spec, "missing"); ok {
		t.Fatal("expected missing step")
	}
	if _, ok := FindLabStepSpec(nil, "step-a"); ok {
		t.Fatal("nil lab must not match")
	}
}

func TestResolveLabActionIndex(t *testing.T) {
	t.Parallel()
	step := recipes.LabStep{
		Actions: []recipes.LabAction{
			{Type: recipes.LabActionOpenTab, Tab: "runtime"},
			{Type: recipes.LabActionInvokeWrite, Op: "sqs.send"},
		},
	}
	index := 1
	got, err := ResolveLabActionIndex(step, &index, nil)
	if err != nil || got != 1 {
		t.Fatalf("by index: got=%d err=%v", got, err)
	}
	bad := -1
	if _, err := ResolveLabActionIndex(step, &bad, nil); err == nil {
		t.Fatal("expected out-of-range index error")
	}
	payload, _ := json.Marshal(map[string]string{"type": recipes.LabActionInvokeWrite, "op": "sqs.send"})
	got, err = ResolveLabActionIndex(step, nil, payload)
	if err != nil || got != 1 {
		t.Fatalf("by payload: got=%d err=%v", got, err)
	}
	if _, err := ResolveLabActionIndex(step, nil, nil); err == nil {
		t.Fatal("expected missing action index error")
	}
}

func TestDeploymentProfileAndRegion(t *testing.T) {
	t.Parallel()
	snapshot := discovery.Snapshot{
		Profiles: []models.ProfileSummary{
			{ProviderID: "aws", ProfileID: "local", Attributes: []models.DetailField{{Label: "Region", Value: "eu-west-1"}}},
			{ProviderID: "aws", ProfileID: "other"},
		},
	}
	deployment := &deploy.Deployment{
		ProviderID: "aws",
		ProfileID:  "local",
		Variables:  map[string]any{"aws_region": "us-west-2"},
	}
	profile, err := DeploymentProfile(snapshot, deployment)
	if err != nil {
		t.Fatalf("DeploymentProfile: %v", err)
	}
	if profile.ProfileID != "local" {
		t.Fatalf("profile = %q", profile.ProfileID)
	}
	if region := DeploymentAWSRegion(deployment, profile); region != "us-west-2" {
		t.Fatalf("region with variable = %q", region)
	}
	deployment.Variables = nil
	if region := DeploymentAWSRegion(deployment, profile); region != "eu-west-1" {
		t.Fatalf("region from profile = %q", region)
	}
}

func TestWritesEnabled(t *testing.T) {
	t.Parallel()
	if WritesEnabled(models.SessionSnapshot{IsLocked: true, AWSWriteModeEnabled: true}, models.ProfileSummary{}) != true {
		t.Fatal("expected writes enabled")
	}
	if WritesEnabled(models.SessionSnapshot{IsLocked: true}, models.ProfileSummary{}) {
		t.Fatal("expected writes disabled without mode")
	}
}

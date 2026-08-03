// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package aws

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	"cloudsprocket/backend/daemon/internal/discovery"
	"cloudsprocket/backend/daemon/internal/models"
)

type fakeSQS struct {
	peeked  bool
	sent    bool
	created bool
}

func (f *fakeSQS) PeekMessages(context.Context, models.ProfileSummary, string, string) (models.AwsSqsPeekResult, error) {
	f.peeked = true
	return models.AwsSqsPeekResult{}, nil
}
func (f *fakeSQS) SendMessage(context.Context, models.ProfileSummary, string, string, string) (models.AwsSqsSendResult, error) {
	f.sent = true
	return models.AwsSqsSendResult{}, nil
}
func (f *fakeSQS) CreateQueue(context.Context, models.ProfileSummary, string, string) (models.AwsSqsCreateQueueResult, error) {
	f.created = true
	return models.AwsSqsCreateQueueResult{QueueName: "q", QueueURL: "https://q"}, nil
}

func TestActiveSQSSelection(t *testing.T) {
	profile := models.ProfileSummary{ProfileID: "p1", ProviderID: "aws"}
	snap := discovery.Snapshot{Profiles: []models.ProfileSummary{profile}}
	session := models.SessionSnapshot{
		IsLocked:            true,
		CurrentProviderID:   "aws",
		SelectedProfileID:   "p1",
		SelectedSQSRegion:   "eu-west-1",
		SelectedSQSQueueURL: "https://queue",
	}
	got, region, queue, err := ActiveSQSSelection(snap, session, "")
	if err != nil {
		t.Fatal(err)
	}
	if got.ProfileID != "p1" || region != "eu-west-1" || queue != "https://queue" {
		t.Fatalf("got profile=%s region=%s queue=%s", got.ProfileID, region, queue)
	}
	_, _, _, err = ActiveSQSSelection(snap, models.SessionSnapshot{IsLocked: false}, "")
	if err == nil {
		t.Fatal("expected unlocked error")
	}
}

func TestHandleSQSCreateQueue(t *testing.T) {
	sqs := &fakeSQS{}
	inv := &fakeInvalidator{}
	sess := &fakeSession{session: models.SessionSnapshot{
		IsLocked:            true,
		CurrentProviderID:   "aws",
		SelectedProfileID:   "p1",
		AWSWriteModeEnabled: true,
		SelectedSQSRegion:   "us-east-1",
	}}
	svc := New(Deps{
		Discovery: fakeDiscovery{snapshot: discovery.Snapshot{
			Profiles: []models.ProfileSummary{{ProfileID: "p1", ProviderID: "aws"}},
		}},
		Session:       sess,
		Workspace:     &fakeWorkspace{},
		Activity:      &fakeActivity{},
		Invalidator:   inv,
		SQS:           sqs,
		ActionTimeout: 5 * time.Second,
	})
	params, _ := json.Marshal(map[string]string{"queueName": "orders"})
	if _, err := svc.HandleSQSCreateQueue(context.Background(), params, nil); err != nil {
		t.Fatal(err)
	}
	if !sqs.created {
		t.Fatal("expected CreateQueue")
	}
	if sess.session.SelectedSQSQueueURL != "https://q" {
		t.Fatalf("selected queue = %q", sess.session.SelectedSQSQueueURL)
	}
	if len(inv.scopes) != 0 {
		// InvalidateResourceCache uses scope+hash, not scopes list
	}
}

func TestAuthorizeWriteRequiresWriteMode(t *testing.T) {
	svc := New(Deps{
		Discovery: fakeDiscovery{snapshot: discovery.Snapshot{
			Profiles: []models.ProfileSummary{{ProfileID: "p1", ProviderID: "aws"}},
		}},
		Session: &fakeSession{session: models.SessionSnapshot{
			IsLocked:          true,
			CurrentProviderID: "aws",
			SelectedProfileID: "p1",
		}},
		Workspace: &fakeWorkspace{},
	})
	_, _, err := svc.AuthorizeWrite(
		context.Background(),
		discovery.Snapshot{Profiles: []models.ProfileSummary{{ProfileID: "p1", ProviderID: "aws"}}},
		"open workspace",
		"write required",
	)
	if err == nil || err.Error() != "write required" {
		t.Fatalf("err = %v", err)
	}
}

func TestWritesEnabled(t *testing.T) {
	if WritesEnabled(models.SessionSnapshot{IsLocked: true, AWSWriteModeEnabled: true}, models.ProfileSummary{}) != true {
		t.Fatal("expected enabled")
	}
	if WritesEnabled(models.SessionSnapshot{IsLocked: true}, models.ProfileSummary{}) {
		t.Fatal("expected disabled")
	}
}

func TestProfileRegionHintDefault(t *testing.T) {
	if ProfileRegionHint(models.ProfileSummary{}) != "us-east-1" {
		t.Fatal(ProfileRegionHint(models.ProfileSummary{}))
	}
	p := models.ProfileSummary{Attributes: []models.DetailField{{Label: "Region", Value: "ap-south-1"}}}
	if ProfileRegionHint(p) != "ap-south-1" {
		t.Fatal(ProfileRegionHint(p))
	}
}

func TestHandleSQSPeekUsesWriter(t *testing.T) {
	sqs := &fakeSQS{}
	svc := New(Deps{
		Discovery: fakeDiscovery{snapshot: discovery.Snapshot{
			Profiles: []models.ProfileSummary{{ProfileID: "p1", ProviderID: "aws"}},
		}},
		Session: &fakeSession{session: models.SessionSnapshot{
			IsLocked:            true,
			CurrentProviderID:   "aws",
			SelectedProfileID:   "p1",
			AWSWriteModeEnabled: true,
			SelectedSQSRegion:   "us-east-1",
			SelectedSQSQueueURL: "https://q",
		}},
		Workspace: &fakeWorkspace{},
		SQS:       sqs,
	})
	params, _ := json.Marshal(map[string]string{"queueUrl": ""})
	if _, err := svc.HandleSQSPeek(context.Background(), params, nil); err != nil {
		t.Fatal(err)
	}
	if !sqs.peeked {
		t.Fatal("expected peek")
	}
}

func TestHandleSecretsRevealGatesWriteMode(t *testing.T) {
	svc := New(Deps{
		Discovery: fakeDiscovery{snapshot: discovery.Snapshot{
			Profiles: []models.ProfileSummary{{ProfileID: "p1", ProviderID: "aws"}},
		}},
		Session: &fakeSession{session: models.SessionSnapshot{
			IsLocked:          true,
			CurrentProviderID: "aws",
			SelectedProfileID: "p1",
		}},
		Workspace: &fakeWorkspace{},
		Secrets:   secretsStub{},
	})
	params, _ := json.Marshal(map[string]string{"region": "us-east-1", "secretName": "x"})
	_, err := svc.HandleSecretsReveal(context.Background(), params, nil)
	if err == nil {
		t.Fatal("expected write mode gate")
	}
}

type secretsStub struct{}

func (secretsStub) GetSecretValue(context.Context, models.ProfileSummary, string, string) (string, error) {
	return "secret", nil
}

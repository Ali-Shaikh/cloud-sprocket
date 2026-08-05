// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package azure

import (
	"context"
	"encoding/json"
	"testing"

	"cloudsprocket/backend/daemon/internal/app/sessionport"
	"cloudsprocket/backend/daemon/internal/discovery"
	"cloudsprocket/backend/daemon/internal/models"
)

type fakeActivity struct {
	notified int
}

func (f *fakeActivity) Timestamp() string { return "ts" }
func (f *fakeActivity) NotifyStateAndLog(context.Context, discovery.Snapshot, models.SessionSnapshot, sessionport.Notifier, string, string) error {
	f.notified++
	return nil
}
func (f *fakeActivity) NotifyJob(sessionport.Notifier, models.JobStatus) {}
func (f *fakeActivity) AppendActivity(context.Context, sessionport.Notifier, string, string) error {
	return nil
}

func TestWithLockedAzureWorkspaceRejectsUnlocked(t *testing.T) {
	svc := New(Deps{
		Discovery: fakeDiscovery{},
		Session:   &fakeSession{session: models.SessionSnapshot{IsLocked: false}},
		Workspace: &fakeWorkspace{},
	})
	_, _, err := svc.withLockedAzureWorkspace(context.Background(), "open an Azure workspace first", nil)
	if err == nil || err.Error() != "open an Azure workspace first" {
		t.Fatalf("err = %v", err)
	}
}

func TestWithLockedAzureWorkspaceRejectsNonAzureProvider(t *testing.T) {
	svc := New(Deps{
		Discovery: fakeDiscovery{},
		Session: &fakeSession{session: models.SessionSnapshot{
			IsLocked:          true,
			CurrentProviderID: "aws",
		}},
		Workspace: &fakeWorkspace{},
	})
	_, _, err := svc.withLockedAzureWorkspace(context.Background(), "open an Azure workspace first", func(session *models.SessionSnapshot) error {
		session.SelectedAzureQueue = "q"
		return nil
	})
	if err == nil || err.Error() != "open an Azure workspace first" {
		t.Fatalf("err = %v", err)
	}
}

func TestHandleSelectResourceGroupMutatesAndScopes(t *testing.T) {
	sess := &fakeSession{session: models.SessionSnapshot{
		IsLocked:                   true,
		CurrentProviderID:          "azure",
		SelectedAzureResourceGroup: "old-rg",
		SelectedAzureVMID:          "vm-1",
	}}
	ws := &fakeWorkspace{}
	act := &fakeActivity{}
	svc := New(Deps{
		Discovery: fakeDiscovery{},
		Session:   sess,
		Workspace: ws,
		Activity:  act,
	})

	params, _ := json.Marshal(map[string]string{"resourceGroup": "  rg-new  "})
	result, err := svc.HandleSelectResourceGroup(context.Background(), params, nil)
	if err != nil {
		t.Fatalf("HandleSelectResourceGroup: %v", err)
	}
	if _, ok := result.(models.WorkspaceSnapshot); !ok {
		t.Fatalf("expected WorkspaceSnapshot, got %T", result)
	}
	if sess.session.SelectedAzureResourceGroup != "rg-new" {
		t.Fatalf("resource group = %q", sess.session.SelectedAzureResourceGroup)
	}
	if sess.session.SelectedAzureVMID != "" {
		t.Fatalf("expected VM cleared, got %q", sess.session.SelectedAzureVMID)
	}
	if !ws.lastOpts.AzureResourceGroupSelection || !ws.lastOpts.SkipAwsInventory {
		t.Fatalf("workspace opts = %+v", ws.lastOpts)
	}
	if ws.lastOpts.AzureScope != "" {
		t.Fatalf("RG select must not set AzureScope, got %q", ws.lastOpts.AzureScope)
	}
	if act.notified != 0 {
		t.Fatalf("empty log must not notify, got %d", act.notified)
	}
}

func TestHandleStorageSelectAccountClearsContainerAndBlob(t *testing.T) {
	sess := &fakeSession{session: models.SessionSnapshot{
		IsLocked:                    true,
		CurrentProviderID:           "azure",
		SelectedAzureStorageAccount: "old",
		SelectedAzureBlobContainer:  "c",
		SelectedAzureBlobName:       "b",
	}}
	ws := &fakeWorkspace{}
	svc := New(Deps{
		Discovery: fakeDiscovery{},
		Session:   sess,
		Workspace: ws,
		Activity:  &fakeActivity{},
	})

	params, _ := json.Marshal(map[string]string{"accountName": "acct-new"})
	if _, err := svc.HandleStorageSelectAccount(context.Background(), params, nil); err != nil {
		t.Fatalf("HandleStorageSelectAccount: %v", err)
	}
	if sess.session.SelectedAzureStorageAccount != "acct-new" {
		t.Fatalf("account = %q", sess.session.SelectedAzureStorageAccount)
	}
	if sess.session.SelectedAzureBlobContainer != "" || sess.session.SelectedAzureBlobName != "" {
		t.Fatalf("expected container/blob cleared, got container=%q blob=%q",
			sess.session.SelectedAzureBlobContainer, sess.session.SelectedAzureBlobName)
	}
	if ws.lastOpts.AzureScope != "storage" || !ws.lastOpts.SkipAwsInventory {
		t.Fatalf("workspace opts = %+v", ws.lastOpts)
	}
}

func TestHandleWafSelectPolicyScopesWaf(t *testing.T) {
	sess := &fakeSession{session: models.SessionSnapshot{
		IsLocked:          true,
		CurrentProviderID: "azure",
	}}
	ws := &fakeWorkspace{}
	svc := New(Deps{
		Discovery: fakeDiscovery{},
		Session:   sess,
		Workspace: ws,
		Activity:  &fakeActivity{},
	})
	params, _ := json.Marshal(map[string]string{"policyName": "  demo-waf  "})
	if _, err := svc.HandleWafSelectPolicy(context.Background(), params, nil); err != nil {
		t.Fatalf("HandleWafSelectPolicy: %v", err)
	}
	if sess.session.SelectedAzureWafPolicy != "demo-waf" {
		t.Fatalf("policy = %q", sess.session.SelectedAzureWafPolicy)
	}
	if ws.lastOpts.AzureScope != "waf" || !ws.lastOpts.SkipAwsInventory {
		t.Fatalf("workspace opts = %+v", ws.lastOpts)
	}
}

func TestHandleLogAnalyticsSelectWorkspaceReturnsSelectionResult(t *testing.T) {
	sess := &fakeSession{session: models.SessionSnapshot{
		IsLocked:          true,
		CurrentProviderID: "azure",
	}}
	ws := &fakeWorkspace{}
	svc := New(Deps{
		Discovery: fakeDiscovery{},
		Session:   sess,
		Workspace: ws,
	})
	params, _ := json.Marshal(map[string]string{"workspace": "  law-1  "})
	result, err := svc.HandleLogAnalyticsSelectWorkspace(context.Background(), params, nil)
	if err != nil {
		t.Fatalf("HandleLogAnalyticsSelectWorkspace: %v", err)
	}
	got, ok := result.(models.AzureLogAnalyticsSelectionResult)
	if !ok {
		t.Fatalf("expected AzureLogAnalyticsSelectionResult, got %T", result)
	}
	if got.Workspace != "law-1" {
		t.Fatalf("workspace = %q", got.Workspace)
	}
	if sess.session.SelectedAzureLogWorkspace != "law-1" {
		t.Fatalf("session workspace = %q", sess.session.SelectedAzureLogWorkspace)
	}
	if ws.built != 0 {
		t.Fatalf("log analytics select must not rebuild workspace, built=%d", ws.built)
	}
}

func TestAllSelectHandlersSucceedOnLockedAzureSession(t *testing.T) {
	type caseSpec struct {
		name   string
		params map[string]string
		call   func(*Service, context.Context, json.RawMessage, sessionport.Notifier) (any, error)
		scope  string
		rgSel  bool
		check  func(t *testing.T, session models.SessionSnapshot)
	}

	cases := []caseSpec{
		{
			name:   "vm",
			params: map[string]string{"vmId": "  vm-9  "},
			call:   (*Service).HandleSelectVirtualMachine,
			rgSel:  true,
			check: func(t *testing.T, session models.SessionSnapshot) {
				if session.SelectedAzureVMID != "vm-9" {
					t.Fatalf("vm = %q", session.SelectedAzureVMID)
				}
			},
		},
		{
			name:   "webapp",
			params: map[string]string{"appName": "app1"},
			call:   (*Service).HandleWebAppsSelect,
			scope:  "webapps",
		},
		{
			name:   "webapp.slot",
			params: map[string]string{"slot": " staging "},
			call:   (*Service).HandleWebAppsSelectSlot,
			scope:  "webapps",
			check: func(t *testing.T, session models.SessionSnapshot) {
				if session.SelectedAzureWebAppSlot != "staging" {
					t.Fatalf("slot = %q", session.SelectedAzureWebAppSlot)
				}
			},
		},
		{
			name:   "storage.container",
			params: map[string]string{"containerName": "logs"},
			call:   (*Service).HandleStorageSelectContainer,
			scope:  "storage",
		},
		{
			name:   "storage.blob",
			params: map[string]string{"blobName": "a.txt"},
			call:   (*Service).HandleStorageSelectBlob,
			scope:  "storage",
		},
		{
			name:   "storage.prefix",
			params: map[string]string{"prefix": "docs/"},
			call:   (*Service).HandleStorageSetPrefixFilter,
			scope:  "storage",
		},
		{
			name:   "frontdoor.profile",
			params: map[string]string{"profile": "fd-prof"},
			call:   (*Service).HandleFrontDoorSelectProfile,
			scope:  "frontdoor",
		},
		{
			name:   "frontdoor.endpoint",
			params: map[string]string{"endpoint": "ep1"},
			call:   (*Service).HandleFrontDoorSelectEndpoint,
			scope:  "frontdoor",
		},
		{
			name:   "frontdoor.originGroup",
			params: map[string]string{"originGroup": "og1"},
			call:   (*Service).HandleFrontDoorSelectOriginGroup,
			scope:  "frontdoor",
		},
		{
			name:   "functions.app",
			params: map[string]string{"appName": " fn-app "},
			call:   (*Service).HandleFunctionsSelectApp,
			scope:  "functions",
			check: func(t *testing.T, session models.SessionSnapshot) {
				if session.SelectedAzureFunctionApp != "fn-app" {
					t.Fatalf("app = %q", session.SelectedAzureFunctionApp)
				}
			},
		},
		{
			name:   "functions.function",
			params: map[string]string{"functionName": " Hello "},
			call:   (*Service).HandleFunctionsSelectFunction,
			scope:  "functions",
			check: func(t *testing.T, session models.SessionSnapshot) {
				if session.SelectedAzureFunction != "Hello" {
					t.Fatalf("function = %q", session.SelectedAzureFunction)
				}
			},
		},
		{
			name:   "keyvault.vault",
			params: map[string]string{"vaultName": " kv1 "},
			call:   (*Service).HandleKeyVaultSelectVault,
			scope:  "keyvault",
		},
		{
			name:   "keyvault.secret",
			params: map[string]string{"secretName": " s1 "},
			call:   (*Service).HandleKeyVaultSelectSecret,
			scope:  "keyvault",
		},
		{
			name:   "cosmos.account",
			params: map[string]string{"account": "cosmos1"},
			call:   (*Service).HandleCosmosSelectAccount,
			scope:  "cosmos",
		},
		{
			name:   "cosmos.database",
			params: map[string]string{"database": "db1"},
			call:   (*Service).HandleCosmosSelectDatabase,
			scope:  "cosmos",
		},
		{
			name:   "cosmos.container",
			params: map[string]string{"container": "c1"},
			call:   (*Service).HandleCosmosSelectContainer,
			scope:  "cosmos",
		},
		{
			name:   "postgres.server",
			params: map[string]string{"server": "pg1"},
			call:   (*Service).HandlePostgresSelectServer,
			scope:  "postgres",
		},
		{
			name:   "queues.queue",
			params: map[string]string{"queue": "q1"},
			call:   (*Service).HandleQueuesSelectQueue,
			scope:  "queues",
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			sess := &fakeSession{session: models.SessionSnapshot{
				IsLocked:          true,
				CurrentProviderID: "azure",
			}}
			ws := &fakeWorkspace{}
			svc := New(Deps{
				Discovery: fakeDiscovery{},
				Session:   sess,
				Workspace: ws,
				Activity:  &fakeActivity{},
			})
			params, err := json.Marshal(tc.params)
			if err != nil {
				t.Fatal(err)
			}
			if _, err := tc.call(svc, context.Background(), params, nil); err != nil {
				t.Fatalf("handler: %v", err)
			}
			if ws.lastOpts.AzureScope != tc.scope {
				t.Fatalf("AzureScope = %q, want %q", ws.lastOpts.AzureScope, tc.scope)
			}
			if ws.lastOpts.AzureResourceGroupSelection != tc.rgSel {
				t.Fatalf("AzureResourceGroupSelection = %v, want %v", ws.lastOpts.AzureResourceGroupSelection, tc.rgSel)
			}
			if !ws.lastOpts.SkipAwsInventory {
				t.Fatal("expected SkipAwsInventory")
			}
			if tc.check != nil {
				tc.check(t, sess.session)
			}
		})
	}
}

func TestSelectHandlersRejectInvalidJSON(t *testing.T) {
	svc := New(Deps{
		Discovery: fakeDiscovery{},
		Session: &fakeSession{session: models.SessionSnapshot{
			IsLocked:          true,
			CurrentProviderID: "azure",
		}},
		Workspace: &fakeWorkspace{},
	})
	_, err := svc.HandleQueuesSelectQueue(context.Background(), json.RawMessage(`{`), nil)
	if err == nil {
		t.Fatal("expected JSON error")
	}
}

func TestFinishAzureSelectionNotifiesWhenLogPresent(t *testing.T) {
	act := &fakeActivity{}
	ws := &fakeWorkspace{}
	svc := New(Deps{
		Discovery: fakeDiscovery{},
		Session: &fakeSession{session: models.SessionSnapshot{
			IsLocked:          true,
			CurrentProviderID: "azure",
		}},
		Workspace: ws,
		Activity:  act,
	})
	_, err := svc.finishAzureSelection(
		context.Background(),
		discovery.Snapshot{},
		models.SessionSnapshot{},
		nil,
		sessionport.SnapshotOptions{AzureScope: "queues"},
		"info",
		"Selected queue.",
	)
	if err != nil {
		t.Fatal(err)
	}
	if act.notified != 1 {
		t.Fatalf("expected NotifyStateAndLog once, got %d", act.notified)
	}
	if !ws.lastOpts.SkipAwsInventory || ws.lastOpts.AzureScope != "queues" {
		t.Fatalf("opts = %+v", ws.lastOpts)
	}
}

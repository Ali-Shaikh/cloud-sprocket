// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package app

import (
	"context"
	"errors"
	"path/filepath"
	"testing"
	"time"

	"cloudsprocket/backend/daemon/internal/app/sessionport"
	"cloudsprocket/backend/daemon/internal/config"
	"cloudsprocket/backend/daemon/internal/discovery"
	"cloudsprocket/backend/daemon/internal/models"
	"cloudsprocket/backend/daemon/internal/store"
)

func TestSessionPortLoadAndUpdateHoldBriefLock(t *testing.T) {
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

	s := &Service{
		settings: settings,
		store:    dataStore,
		now:      func() time.Time { return time.Now().UTC() },
	}
	snapshot := discovery.Snapshot{
		Providers: []models.ProviderSummary{{ProviderID: "aws", Label: "AWS"}},
		Profiles: []models.ProfileSummary{
			{ProfileID: "sandbox", ProviderID: "aws", DisplayName: "sandbox"},
		},
	}

	// Load through the public port.
	session, err := s.Load(context.Background(), snapshot)
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if session.IsLocked {
		t.Fatal("expected unlocked session after first load")
	}

	// Update mutates and persists under the session lock only.
	updated, err := s.Update(context.Background(), snapshot, func(sess *models.SessionSnapshot) error {
		sess.CurrentProviderID = "aws"
		sess.SelectedProfileID = "sandbox"
		sess.IsLocked = true
		return nil
	})
	if err != nil {
		t.Fatalf("Update: %v", err)
	}
	if !updated.IsLocked || updated.SelectedProfileID != "sandbox" {
		t.Fatalf("unexpected session after Update: %+v", updated)
	}

	// Mutate errors abort without persisting a partial change.
	_, err = s.Update(context.Background(), snapshot, func(sess *models.SessionSnapshot) error {
		sess.SelectedProfileID = "should-not-persist"
		return errors.New("guard failed")
	})
	if err == nil || err.Error() != "guard failed" {
		t.Fatalf("expected guard error, got %v", err)
	}
	reloaded, err := s.Load(context.Background(), snapshot)
	if err != nil {
		t.Fatalf("Load after failed Update: %v", err)
	}
	if reloaded.SelectedProfileID != "sandbox" {
		t.Fatalf("failed Update mutated stored session: %+v", reloaded)
	}
}

func TestSessionPortsBundleImplementsContracts(t *testing.T) {
	s := &Service{now: func() time.Time { return time.Now().UTC() }}
	ports := s.SessionPorts()
	if ports.Session == nil || ports.Workspace == nil || ports.Invalidator == nil || ports.Activity == nil {
		t.Fatal("SessionPorts returned nil members")
	}
	// Type assertions already compile against the interfaces; exercise Timestamp.
	if ports.Activity.Timestamp() == "" {
		t.Fatal("expected non-empty timestamp")
	}
}

func TestSnapshotOptionsRoundTrip(t *testing.T) {
	in := sessionport.SnapshotOptions{
		LightweightAWS:              true,
		SkipAzureInventory:          true,
		AWSScope:                    "s3",
		LightweightAzure:            true,
		SkipAwsInventory:            true,
		AzureScope:                  "storage",
		AzureResourceGroupSelection: true,
		AzureDeferredInventory:      true,
		AWSDeferredInventory:        true,
	}
	internal := snapshotOptionsFromPort(in)
	out := snapshotOptionsToPort(internal)
	if out != in {
		t.Fatalf("options round-trip mismatch:\n in=%+v\nout=%+v", in, out)
	}
}

func TestInvalidatorMethodsAreCallable(t *testing.T) {
	dir := t.TempDir()
	settings := config.FromEnv(map[string]string{"CLOUDSPROCKET_CONFIG_DIR": dir}, "linux", dir)
	if err := settings.EnsureRuntimeDirs(); err != nil {
		t.Fatalf("EnsureRuntimeDirs: %v", err)
	}
	dataStore, err := store.Open(filepath.Join(dir, "state.db"))
	if err != nil {
		t.Fatalf("store.Open: %v", err)
	}
	t.Cleanup(func() { _ = dataStore.Close() })

	s := &Service{
		settings: settings,
		store:    dataStore,
		now:      func() time.Time { return time.Now().UTC() },
		rt:       nil, // InvalidateRuntimeStatus must tolerate nil runtime
	}
	var inv sessionport.Invalidator = s
	inv.InvalidateRuntimeStatus()
	inv.InvalidateAzureCLIExtensionCache()
	inv.InvalidateCloudResourceCaches(context.Background())
	inv.InvalidateResourceCache(context.Background(), "aws.s3", "hash")
	inv.InvalidateResourceCacheScope(context.Background(), "aws.s3")
}

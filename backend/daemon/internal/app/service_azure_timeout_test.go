package app

import (
	"context"
	"path/filepath"
	"testing"
	"time"

	"cloudsprocket/backend/daemon/internal/models"
	"cloudsprocket/backend/daemon/internal/store"
)

// blockingAzure blocks until the call's context is cancelled, simulating a
// stalled floci-az ARM pager or `az` CLI invocation.
type blockingAzure struct{}

func (blockingAzure) ListResourceGroups(ctx context.Context, _ models.ProfileSummary) ([]models.AzureResourceGroup, error) {
	<-ctx.Done()
	return nil, ctx.Err()
}

func (blockingAzure) ListVirtualMachines(ctx context.Context, _ models.ProfileSummary, _ string) ([]models.AzureVirtualMachine, error) {
	<-ctx.Done()
	return nil, ctx.Err()
}

// TestAzureInventoryBoundedByTimeout proves a stalled Azure inventory call is
// cut off by the configured timeout (and falls back to empty) instead of
// hanging the workspace snapshot.
func TestAzureInventoryBoundedByTimeout(t *testing.T) {
	dataStore, err := store.Open(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatalf("store.Open: %v", err)
	}
	t.Cleanup(func() { _ = dataStore.Close() })

	s := &Service{
		store:                 dataStore,
		azure:                 blockingAzure{},
		azureInventoryTimeout: 50 * time.Millisecond,
		now:                   func() time.Time { return time.Now().UTC() },
	}

	profile := models.ProfileSummary{ProviderID: "azure", ProfileID: "sub-1"}

	start := time.Now()
	groups := s.azureResourceGroups(context.Background(), profile)
	if elapsed := time.Since(start); elapsed > 2*time.Second {
		t.Fatalf("azureResourceGroups did not honour the timeout, took %v", elapsed)
	}
	if len(groups) != 0 {
		t.Fatalf("expected empty resource groups on timeout, got %d", len(groups))
	}

	start = time.Now()
	vms := s.azureVirtualMachines(context.Background(), profile, "rg-1")
	if elapsed := time.Since(start); elapsed > 2*time.Second {
		t.Fatalf("azureVirtualMachines did not honour the timeout, took %v", elapsed)
	}
	if len(vms) != 0 {
		t.Fatalf("expected empty VMs on timeout, got %d", len(vms))
	}
}

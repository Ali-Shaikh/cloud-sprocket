// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package azureadapter

import (
	"context"
	"os"
	"testing"

	"cloudsprocket/backend/daemon/internal/config"
	"cloudsprocket/backend/daemon/internal/flociazcompat"
)

// TestLiveFlociEndToEnd exercises the REAL credential path (MSAL client-secret
// against floci-az's live login endpoint over plain HTTP), not the stubbed
// credential used by the other tests. It is gated behind FLOCI_LIVE so it never
// runs in the normal suite. Requires a floci-az container on the endpoint with
// at least one resource group named in FLOCI_LIVE_RG.
func TestLiveFlociEndToEnd(t *testing.T) {
	if os.Getenv("FLOCI_LIVE") == "" {
		t.Skip("set FLOCI_LIVE=1 (and a running floci-az) to run")
	}
	endpoint := os.Getenv("CLOUDSPROCKET_FLOCI_AZ_ENDPOINT")
	if endpoint == "" {
		endpoint = flociazcompat.DefaultEndpoint
	}
	inv := NewInventory(config.Settings{FlociAZEndpoint: endpoint})

	groups, err := inv.ListResourceGroups(context.Background(), localFlociProfile())
	if err != nil {
		t.Fatalf("live ListResourceGroups: %v", err)
	}
	t.Logf("live resource groups: %d", len(groups))
	for _, g := range groups {
		t.Logf("  rg=%s location=%s state=%s", g.Name, g.Location, g.ProvisioningState)
	}

	rg := os.Getenv("FLOCI_LIVE_RG")
	if rg == "" && len(groups) > 0 {
		rg = groups[0].Name
	}
	if rg != "" {
		vms, err := inv.ListVirtualMachines(context.Background(), localFlociProfile(), rg)
		if err != nil {
			t.Fatalf("live ListVirtualMachines(%s): %v", rg, err)
		}
		t.Logf("live VMs in %s: %d", rg, len(vms))
		for _, vm := range vms {
			t.Logf("  vm=%s size=%s os=%s state=%s", vm.Name, vm.Size, vm.OSType, vm.ProvisioningState)
		}
	}
}

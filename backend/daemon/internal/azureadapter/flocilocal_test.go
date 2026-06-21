// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package azureadapter

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/Azure/azure-sdk-for-go/sdk/azcore"
	"github.com/Azure/azure-sdk-for-go/sdk/azcore/cloud"
	"github.com/Azure/azure-sdk-for-go/sdk/azcore/policy"

	"cloudsprocket/backend/daemon/internal/config"
	"cloudsprocket/backend/daemon/internal/models"
)

// staticCredential returns a fixed token so the adapter tests exercise the ARM
// read path without standing up a login endpoint.
type staticCredential struct{}

func (staticCredential) GetToken(context.Context, policy.TokenRequestOptions) (azcore.AccessToken, error) {
	return azcore.AccessToken{Token: "fake-token", ExpiresOn: time.Now().Add(time.Hour)}, nil
}

const (
	flociResourceGroupsJSON = `{"value":[
		{"id":"/subscriptions/00000000-0000-0000-0000-000000000001/resourceGroups/spike-rg","name":"spike-rg","type":"Microsoft.Resources/resourceGroups","location":"westeurope","properties":{"provisioningState":"Succeeded"},"tags":{"env":"spike","owner":"ali"}},
		{"id":"/subscriptions/00000000-0000-0000-0000-000000000001/resourceGroups/app-rg","name":"app-rg","type":"Microsoft.Resources/resourceGroups","location":"northeurope","properties":{"provisioningState":"Succeeded"}}
	]}`

	flociVirtualMachinesJSON = `{"value":[
		{"id":"/subscriptions/00000000-0000-0000-0000-000000000001/resourceGroups/spike-rg/providers/Microsoft.Compute/virtualMachines/spike-vm","name":"spike-vm","type":"Microsoft.Compute/virtualMachines","location":"westeurope","tags":{"role":"web"},"properties":{"hardwareProfile":{"vmSize":"Standard_B1s"},"storageProfile":{"osDisk":{"osType":"Linux"}},"vmId":"2ba37e39-309a-4484-9ef4-a7bfa0605d56","provisioningState":"Succeeded"}}
	]}`
)

func newFlociTestServer(t *testing.T) *httptest.Server {
	t.Helper()
	createdGroups := map[string]bool{}
	mux := http.NewServeMux()
	var server *httptest.Server
	mux.HandleFunc("/async", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(w, `{"status":"Succeeded"}`)
	})
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		path := strings.ToLower(r.URL.Path)
		w.Header().Set("Content-Type", "application/json")
		switch {
		case strings.Contains(path, "/providers/microsoft.compute/virtualmachines"):
			_, _ = io.WriteString(w, flociVirtualMachinesJSON)
		case strings.HasSuffix(path, "/resourcegroups") && r.Method == http.MethodGet:
			_, _ = io.WriteString(w, flociResourceGroupsJSON)
		case strings.Contains(path, "/resourcegroups/") && r.Method == http.MethodPut:
			name := strings.TrimPrefix(path, "/subscriptions/00000000-0000-0000-0000-000000000001/resourcegroups/")
			createdGroups[name] = true
			_, _ = io.WriteString(w, `{"name":"`+name+`","location":"westeurope","properties":{"provisioningState":"Succeeded"}}`)
		case strings.Contains(path, "/resourcegroups/") && r.Method == http.MethodDelete:
			w.Header().Set("Azure-AsyncOperation", server.URL+"/async")
			w.WriteHeader(http.StatusAccepted)
			_, _ = io.WriteString(w, `{}`)
		case strings.HasSuffix(path, "/resourcegroups"):
			_, _ = io.WriteString(w, flociResourceGroupsJSON)
		default:
			http.NotFound(w, r)
		}
	})
	server = httptest.NewServer(mux)
	t.Cleanup(server.Close)
	return server
}

func newLocalInventory(endpoint string) *Inventory {
	inv := NewInventory(config.Settings{FlociAZEndpoint: endpoint})
	inv.newLocalCredential = func(cloud.Configuration) (azcore.TokenCredential, error) {
		return staticCredential{}, nil
	}
	return inv
}

func localFlociProfile() models.ProfileSummary {
	return models.ProfileSummary{
		ProviderID: "azure",
		ProfileID:  "cloudsprocket-floci-az",
		Attributes: []models.DetailField{
			{Label: "Subscription ID", Value: "cloudsprocket-floci-az"},
			{Label: "Tenant ID", Value: localTenantMarker},
		},
	}
}

func TestIsLocalFlociProfile(t *testing.T) {
	if !isLocalFlociProfile(localFlociProfile()) {
		t.Fatal("expected the local floci profile to be detected")
	}
	real := models.ProfileSummary{
		ProviderID: "azure",
		ProfileID:  "11111111-2222-3333-4444-555555555555",
		Attributes: []models.DetailField{{Label: "Tenant ID", Value: "real-tenant-guid"}},
	}
	if isLocalFlociProfile(real) {
		t.Fatal("expected a real Azure profile not to be detected as local")
	}
}

func TestListResourceGroupsLocalFloci(t *testing.T) {
	server := newFlociTestServer(t)
	inv := newLocalInventory(server.URL)

	groups, err := inv.ListResourceGroups(context.Background(), localFlociProfile())
	if err != nil {
		t.Fatalf("ListResourceGroups returned error: %v", err)
	}
	if len(groups) != 2 {
		t.Fatalf("expected 2 resource groups, got %d", len(groups))
	}
	// Sorted alphabetically: app-rg before spike-rg.
	if groups[0].Name != "app-rg" || groups[1].Name != "spike-rg" {
		t.Fatalf("unexpected group order: %q, %q", groups[0].Name, groups[1].Name)
	}
	spike := groups[1]
	if spike.Location != "westeurope" || spike.ProvisioningState != "Succeeded" {
		t.Fatalf("unexpected spike-rg fields: %+v", spike)
	}
	if len(spike.Tags) != 2 {
		t.Fatalf("expected 2 tags on spike-rg, got %d", len(spike.Tags))
	}
}

func TestListVirtualMachinesLocalFloci(t *testing.T) {
	server := newFlociTestServer(t)
	inv := newLocalInventory(server.URL)

	vms, err := inv.ListVirtualMachines(context.Background(), localFlociProfile(), "spike-rg")
	if err != nil {
		t.Fatalf("ListVirtualMachines returned error: %v", err)
	}
	if len(vms) != 1 {
		t.Fatalf("expected 1 virtual machine, got %d", len(vms))
	}
	vm := vms[0]
	if vm.Name != "spike-vm" {
		t.Fatalf("unexpected vm name: %q", vm.Name)
	}
	if vm.Size != "Standard_B1s" {
		t.Fatalf("unexpected vm size: %q", vm.Size)
	}
	if vm.OSType != "Linux" {
		t.Fatalf("unexpected vm os type: %q", vm.OSType)
	}
	if vm.ResourceGroup != "spike-rg" {
		t.Fatalf("unexpected vm resource group: %q", vm.ResourceGroup)
	}
	if vm.VMID != "2ba37e39-309a-4484-9ef4-a7bfa0605d56" {
		t.Fatalf("unexpected vm id: %q", vm.VMID)
	}
	if vm.ProvisioningState != "Succeeded" {
		t.Fatalf("unexpected vm provisioning state: %q", vm.ProvisioningState)
	}
}

func TestCreateAndDeleteResourceGroupLocalFloci(t *testing.T) {
	server := newFlociTestServer(t)
	inv := newLocalInventory(server.URL)
	profile := localFlociProfile()

	created, err := inv.CreateResourceGroup(context.Background(), profile, "test-rg", "westeurope")
	if err != nil {
		t.Fatalf("CreateResourceGroup returned error: %v", err)
	}
	if created.Name != "test-rg" || created.Location != "westeurope" {
		t.Fatalf("unexpected created group: %+v", created)
	}
	if err := inv.DeleteResourceGroup(context.Background(), profile, "test-rg"); err != nil {
		t.Fatalf("DeleteResourceGroup returned error: %v", err)
	}
}

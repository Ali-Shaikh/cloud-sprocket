package app

import (
	"strings"
	"testing"

	"cloudsprocket/backend/daemon/internal/models"
)

func TestBastionConnectArgsLinuxPassword(t *testing.T) {
	vm := models.AzureVirtualMachine{
		VMID:   "/subscriptions/sub/resourceGroups/rg/providers/Microsoft.Compute/virtualMachines/demo-vm",
		Name:   "demo-vm",
		OSType: "Linux",
	}
	protocol, args, err := bastionConnectArgs("bastion-hub", "rg-network", vm, "password", "azureuser", "")
	if err != nil {
		t.Fatalf("bastionConnectArgs: %v", err)
	}
	if protocol != "ssh" {
		t.Fatalf("protocol = %q, want ssh", protocol)
	}
	joined := strings.Join(args, " ")
	for _, needle := range []string{"network", "bastion", "ssh", "--auth-type", "password", "--username", "azureuser", vm.VMID} {
		if !strings.Contains(joined, needle) {
			t.Fatalf("expected %q in args %q", needle, joined)
		}
	}
}

func TestBastionConnectArgsWindowsRDP(t *testing.T) {
	vm := models.AzureVirtualMachine{
		VMID:   "/subscriptions/sub/resourceGroups/rg/providers/Microsoft.Compute/virtualMachines/win-vm",
		Name:   "win-vm",
		OSType: "Windows",
	}
	protocol, args, err := bastionConnectArgs("bastion-hub", "rg-network", vm, "", "", "")
	if err != nil {
		t.Fatalf("bastionConnectArgs: %v", err)
	}
	if protocol != "rdp" {
		t.Fatalf("protocol = %q, want rdp", protocol)
	}
	joined := strings.Join(args, " ")
	for _, needle := range []string{"network", "bastion", "rdp", vm.VMID} {
		if !strings.Contains(joined, needle) {
			t.Fatalf("expected %q in args %q", needle, joined)
		}
	}
}
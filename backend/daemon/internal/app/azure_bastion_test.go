// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package app

import (
	"runtime"
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

func TestFormatBastionConnectCommandsWindowsQuotesResourceID(t *testing.T) {
	if runtime.GOOS != "windows" {
		t.Skip("Windows command formatting is platform-specific")
	}
	resourceID := "/subscriptions/sub/resourceGroups/rg/providers/Microsoft.Compute/virtualMachines/ERW-JUMPBOX"
	args := []string{
		"network", "bastion", "rdp",
		"--name", "bastion-hub",
		"--resource-group", "rg-network",
		"--target-resource-id", resourceID,
	}
	cmd, ps := formatBastionConnectCommands("windows", `C:\Program Files\az.cmd`, args)
	if !strings.Contains(cmd, `"`+resourceID+`"`) {
		t.Fatalf("cmd command should quote resource ID, got %q", cmd)
	}
	if !strings.HasPrefix(cmd, `call "C:\Program Files\az.cmd"`) {
		t.Fatalf("cmd command should call quoted az.cmd, got %q", cmd)
	}
	if !strings.Contains(ps, "'"+resourceID+"'") {
		t.Fatalf("PowerShell command should quote resource ID, got %q", ps)
	}
	if !strings.HasPrefix(ps, `& 'C:\Program Files\az.cmd'`) {
		t.Fatalf("PowerShell command should use call operator, got %q", ps)
	}
}
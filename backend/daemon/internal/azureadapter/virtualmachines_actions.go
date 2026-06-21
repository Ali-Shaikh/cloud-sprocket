// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package azureadapter

import (
	"context"
	"fmt"
	"strings"

	"github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/compute/armcompute/v6"

	"cloudsprocket/backend/daemon/internal/models"
)

type VMAction string

const (
	VMActionStart       VMAction = "start"
	VMActionPowerOff    VMAction = "powerOff"
	VMActionDeallocate  VMAction = "deallocate"
	VMActionRestart     VMAction = "restart"
)

func (i *Inventory) InvokeVirtualMachineAction(
	ctx context.Context,
	profile models.ProfileSummary,
	resourceGroup string,
	vmName string,
	action string,
) error {
	parsed, err := ParseVMAction(action)
	if err != nil {
		return err
	}
	return i.invokeVirtualMachineAction(ctx, profile, resourceGroup, vmName, parsed)
}

func (i *Inventory) invokeVirtualMachineAction(
	ctx context.Context,
	profile models.ProfileSummary,
	resourceGroup string,
	vmName string,
	action VMAction,
) error {
	resourceGroup = strings.TrimSpace(resourceGroup)
	vmName = strings.TrimSpace(vmName)
	if resourceGroup == "" || vmName == "" {
		return fmt.Errorf("resource group and virtual machine name are required")
	}
	switch action {
	case VMActionStart, VMActionPowerOff, VMActionDeallocate, VMActionRestart:
	default:
		return fmt.Errorf("unsupported virtual machine action %q", action)
	}
	if isLocalFlociProfile(profile) {
		return i.invokeLocalVirtualMachineAction(ctx, resourceGroup, vmName, action)
	}
	args := []string{
		"vm", string(action),
		"--subscription", profile.ProfileID,
		"--resource-group", resourceGroup,
		"--name", vmName,
		"--only-show-errors",
	}
	if action == VMActionPowerOff {
		args[1] = "stop"
	}
	_, err := i.run(ctx, args...)
	return err
}

func (i *Inventory) invokeLocalVirtualMachineAction(
	ctx context.Context,
	resourceGroup string,
	vmName string,
	action VMAction,
) error {
	cfg := i.flociCloudConfig()
	credential, err := i.newLocalCredential(cfg)
	if err != nil {
		return fmt.Errorf("floci-az credential: %w", err)
	}
	client, err := armcompute.NewVirtualMachinesClient(i.localSubscriptionID, credential, i.flociArmOptions(cfg))
	if err != nil {
		return fmt.Errorf("floci-az virtual machines client: %w", err)
	}
	switch action {
	case VMActionStart:
		startPoller, err := client.BeginStart(ctx, resourceGroup, vmName, nil)
		if err != nil {
			return fmt.Errorf("start floci-az virtual machine: %w", err)
		}
		_, err = startPoller.PollUntilDone(ctx, nil)
		return err
	case VMActionPowerOff:
		stopPoller, err := client.BeginPowerOff(ctx, resourceGroup, vmName, nil)
		if err != nil {
			return fmt.Errorf("power off floci-az virtual machine: %w", err)
		}
		_, err = stopPoller.PollUntilDone(ctx, nil)
		return err
	case VMActionDeallocate:
		deallocPoller, err := client.BeginDeallocate(ctx, resourceGroup, vmName, nil)
		if err != nil {
			return fmt.Errorf("deallocate floci-az virtual machine: %w", err)
		}
		_, err = deallocPoller.PollUntilDone(ctx, nil)
		return err
	case VMActionRestart:
		restartPoller, err := client.BeginRestart(ctx, resourceGroup, vmName, nil)
		if err != nil {
			return fmt.Errorf("restart floci-az virtual machine: %w", err)
		}
		_, err = restartPoller.PollUntilDone(ctx, nil)
		return err
	default:
		return fmt.Errorf("unsupported virtual machine action %q", action)
	}
}

func ParseVMAction(value string) (VMAction, error) {
	switch strings.TrimSpace(value) {
	case "start":
		return VMActionStart, nil
	case "stop", "powerOff":
		return VMActionPowerOff, nil
	case "deallocate":
		return VMActionDeallocate, nil
	case "restart":
		return VMActionRestart, nil
	default:
		return "", fmt.Errorf("unsupported virtual machine action %q", value)
	}
}

// RefreshVirtualMachine reloads a single VM after a power action.
func (i *Inventory) GetVirtualMachine(
	ctx context.Context,
	profile models.ProfileSummary,
	resourceGroup string,
	vmName string,
) (models.AzureVirtualMachine, error) {
	vms, err := i.ListVirtualMachines(ctx, profile, resourceGroup)
	if err != nil {
		return models.AzureVirtualMachine{}, err
	}
	for _, vm := range vms {
		if vm.Name == vmName {
			return vm, nil
		}
	}
	return models.AzureVirtualMachine{}, fmt.Errorf("virtual machine %s was not found in %s", vmName, resourceGroup)
}
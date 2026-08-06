// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package azure

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"cloudsprocket/backend/daemon/internal/app/sessionport"
	"cloudsprocket/backend/daemon/internal/models"
	"cloudsprocket/backend/daemon/internal/sysproc"
)

const bastionHostsCacheScope = "azure.bastion-hosts"

// IsWindowsVM reports whether the VM OS type is Windows (case-insensitive).
func IsWindowsVM(vm models.AzureVirtualMachine) bool {
	return strings.EqualFold(strings.TrimSpace(vm.OSType), "Windows")
}

// BastionConnectArgs builds az network bastion ssh/rdp arguments for the target VM.
func BastionConnectArgs(
	bastionName string,
	bastionResourceGroup string,
	vm models.AzureVirtualMachine,
	authType string,
	username string,
	sshKeyPath string,
) (protocol string, args []string, err error) {
	targetID := strings.TrimSpace(vm.VMID)
	if targetID == "" {
		return "", nil, errors.New("virtual machine resource ID is required for Bastion connect")
	}

	if IsWindowsVM(vm) {
		protocol = "rdp"
		return protocol, []string{
			"network", "bastion", "rdp",
			"--name", bastionName,
			"--resource-group", bastionResourceGroup,
			"--target-resource-id", targetID,
		}, nil
	}

	protocol = "ssh"
	authType = strings.ToLower(strings.TrimSpace(authType))
	if authType == "" {
		authType = "password"
	}
	args = []string{
		"network", "bastion", "ssh",
		"--name", bastionName,
		"--resource-group", bastionResourceGroup,
		"--target-resource-id", targetID,
		"--auth-type", authType,
	}
	switch authType {
	case "password":
		if username == "" {
			return "", nil, errors.New("username is required for password SSH via Bastion")
		}
		args = append(args, "--username", username)
	case "ssh-key":
		if username == "" || sshKeyPath == "" {
			return "", nil, errors.New("username and SSH key path are required for key-based Bastion SSH")
		}
		args = append(args, "--username", username, "--ssh-key", sshKeyPath)
	case "aad":
		// Entra ID sign-in; az prompts as needed.
	default:
		return "", nil, fmt.Errorf("unsupported Bastion auth type %q", authType)
	}
	return protocol, args, nil
}

// FormatBastionConnectCommands returns pasteable cmd and PowerShell command lines.
func FormatBastionConnectCommands(platform string, command string, args []string) (cmd string, powershell string) {
	switch strings.ToLower(strings.TrimSpace(platform)) {
	case "windows":
		return sysproc.BuildWindowsCmdLine(command, args...), sysproc.BuildWindowsPowerShellLine(command, args...)
	default:
		return sysproc.BuildWindowsCmdLine(command, args...), ""
	}
}

// HandleBastionList implements azure.bastion.list.
func (s *Service) HandleBastionList(ctx context.Context, _ json.RawMessage, _ sessionport.Notifier) (any, error) {
	if s == nil || s.discovery == nil || s.session == nil || s.bastionHosts == nil {
		return nil, errors.New("azure bastion service is not available")
	}
	snapshot, err := s.discovery.Discover()
	if err != nil {
		return nil, err
	}
	session, err := s.session.Load(ctx, snapshot)
	if err != nil {
		return nil, err
	}
	profile, err := LockedAzureProfile(snapshot.Profiles, session, "open a locked Azure workspace first")
	if err != nil {
		return nil, err
	}
	if IsLocalFlociProfile(profile) {
		return map[string]any{
			"hosts":         []models.AzureBastionHost{},
			"statusMessage": "Azure Bastion is cloud-only. Use a cloud Azure profile to list Bastion hosts.",
		}, nil
	}
	timeoutCtx, cancel := s.WithActionTimeout(ctx)
	defer cancel()
	hosts := s.bastionHostsCached(timeoutCtx, profile)
	message := fmt.Sprintf("Loaded %d Bastion host(s).", len(hosts))
	if len(hosts) == 0 {
		message = "No Bastion hosts found in this subscription."
	}
	return map[string]any{
		"hosts":         hosts,
		"statusMessage": message,
	}, nil
}

// HandleBastionConnect implements azure.bastion.connect.
func (s *Service) HandleBastionConnect(ctx context.Context, params json.RawMessage, notifier sessionport.Notifier) (any, error) {
	if s == nil || s.discovery == nil || s.session == nil {
		return nil, errors.New("azure bastion service is not available")
	}
	var request struct {
		BastionName          string `json:"bastionName"`
		BastionResourceGroup string `json:"bastionResourceGroup"`
		VMID                 string `json:"vmId"`
		Username             string `json:"username"`
		AuthType             string `json:"authType"`
		SSHKeyPath           string `json:"sshKeyPath"`
		Launch               bool   `json:"launch"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}

	snapshot, err := s.discovery.Discover()
	if err != nil {
		return nil, err
	}
	session, err := s.session.Load(ctx, snapshot)
	if err != nil {
		return nil, err
	}
	profile, err := LockedAzureProfile(snapshot.Profiles, session, "open an Azure workspace before connecting via Bastion")
	if err != nil {
		return nil, err
	}
	if IsLocalFlociProfile(profile) {
		return nil, errors.New("Azure Bastion is cloud-only; switch to a cloud Azure profile")
	}

	vm, err := s.resolveVMByID(profile, session, request.VMID)
	if err != nil {
		return nil, err
	}
	bastionName := strings.TrimSpace(request.BastionName)
	bastionRG := strings.TrimSpace(request.BastionResourceGroup)
	if bastionName == "" || bastionRG == "" {
		return nil, errors.New("select a Bastion host before connecting")
	}
	if strings.TrimSpace(vm.VMID) == "" {
		return nil, errors.New("the selected virtual machine has no resource ID")
	}

	azPath := ProviderCommandPath(snapshot)
	if azPath == "" {
		return nil, errors.New("Azure CLI was not detected; install az and sign in, then retry")
	}

	protocol, args, err := BastionConnectArgs(
		bastionName,
		bastionRG,
		vm,
		strings.TrimSpace(request.AuthType),
		strings.TrimSpace(request.Username),
		strings.TrimSpace(request.SSHKeyPath),
	)
	if err != nil {
		return nil, err
	}

	cmdCommand, psCommand := FormatBastionConnectCommands(s.platformName, azPath, args)
	result := models.AzureBastionConnectResult{
		Command:           cmdCommand,
		PowerShellCommand: psCommand,
		Launched:          false,
		Protocol:          protocol,
	}
	if request.Launch {
		if s.console == nil {
			return nil, errors.New("interactive console launcher is not available")
		}
		// Launch is fire-and-forget: do not pass a cancelable RPC/timeout context or
		// the helper process is killed before the visible console window opens.
		if err := s.console.Spawn(context.Background(), azPath, args...); err != nil {
			return nil, fmt.Errorf("launch Bastion session: %w", err)
		}
		result.Launched = true
		if notifier != nil && s.activity != nil {
			_ = s.activity.AppendActivity(
				ctx,
				notifier,
				"info",
				fmt.Sprintf("Launched Bastion %s session to %s.", protocol, vm.Name),
			)
		}
	}
	return result, nil
}

func (s *Service) bastionHostsCached(ctx context.Context, profile models.ProfileSummary) []models.AzureBastionHost {
	hosts, err := s.bastionHosts.ListBastionHosts(ctx, profile)
	if err == nil {
		if s.bastionCache != nil {
			fetchedAt := ""
			if s.activity != nil {
				fetchedAt = s.activity.Timestamp()
			}
			_ = s.bastionCache.SaveBastionHosts(ctx, profile.ProfileID, hosts, fetchedAt)
		}
		return hosts
	}
	if s.bastionCache != nil {
		if cached, ok, cacheErr := s.bastionCache.LoadBastionHosts(ctx, profile.ProfileID); cacheErr == nil && ok {
			return cached
		}
	}
	return []models.AzureBastionHost{}
}

func (s *Service) resolveVMByID(
	profile models.ProfileSummary,
	session models.SessionSnapshot,
	vmID string,
) (models.AzureVirtualMachine, error) {
	if s.vmLookup == nil {
		return models.AzureVirtualMachine{}, errors.New("virtual machine lookup is not available")
	}
	targetID := strings.TrimSpace(vmID)
	if targetID == "" {
		targetID = session.SelectedAzureVMID
	}
	resourceGroup := session.SelectedAzureResourceGroup
	if resourceGroup == "" {
		return models.AzureVirtualMachine{}, errors.New("select a resource group before connecting to a virtual machine")
	}
	// Match prior façade behaviour: resolve against a non-cancelable context so a
	// short-lived RPC deadline does not abort inventory lookup mid-connect.
	vms := s.vmLookup.ListVirtualMachines(context.Background(), profile, resourceGroup)
	for _, vm := range vms {
		if vm.VMID == targetID || vm.Name == targetID {
			return vm, nil
		}
	}
	return models.AzureVirtualMachine{}, fmt.Errorf("virtual machine %s was not found in %s", targetID, resourceGroup)
}

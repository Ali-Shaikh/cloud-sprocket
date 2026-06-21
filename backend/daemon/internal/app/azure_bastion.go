package app

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"cloudsprocket/backend/daemon/internal/discovery"
	"cloudsprocket/backend/daemon/internal/models"
	"cloudsprocket/backend/daemon/internal/sysproc"
)

func (s *Service) azureBastionHosts(ctx context.Context, profile models.ProfileSummary) []models.AzureBastionHost {
	const scope = "azure.bastion-hosts"
	hosts, err := s.azure.ListBastionHosts(ctx, profile)
	if err == nil {
		_ = s.store.SaveResourceCache(ctx, scope, profile.ProfileID, hosts, s.timestamp())
		return hosts
	}
	var cached []models.AzureBastionHost
	if _, ok, cacheErr := s.store.LoadResourceCache(ctx, scope, profile.ProfileID, &cached); cacheErr == nil && ok {
		return cached
	}
	return []models.AzureBastionHost{}
}

func (s *Service) handleAzureBastionList(ctx context.Context, _ json.RawMessage, _ Notifier) (any, error) {
	profile, _, err := s.lockedAzureProfile(ctx)
	if err != nil {
		return nil, err
	}
	if isLocalFlociProfile(profile) {
		return map[string]any{
			"hosts":         []models.AzureBastionHost{},
			"statusMessage": "Azure Bastion is cloud-only. Use a cloud Azure profile to list Bastion hosts.",
		}, nil
	}
	timeoutCtx, cancel := s.withAzureTimeout(ctx)
	defer cancel()
	hosts := s.azureBastionHosts(timeoutCtx, profile)
	message := fmt.Sprintf("Loaded %d Bastion host(s).", len(hosts))
	if len(hosts) == 0 {
		message = "No Bastion hosts found in this subscription."
	}
	return map[string]any{
		"hosts":         hosts,
		"statusMessage": message,
	}, nil
}

func (s *Service) handleAzureBastionConnect(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
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
	s.mu.Lock()
	session, err := s.currentState(ctx, snapshot)
	if err != nil {
		s.mu.Unlock()
		return nil, err
	}
	if !session.IsLocked || session.CurrentProviderID != "azure" {
		s.mu.Unlock()
		return nil, errors.New("open an Azure workspace before connecting via Bastion")
	}
	profile, ok := findProfile(filterProfiles(snapshot.Profiles, session.CurrentProviderID), session.SelectedProfileID)
	if !ok {
		s.mu.Unlock()
		return nil, errors.New("the workspace's Azure profile is not available")
	}
	if isLocalFlociProfile(profile) {
		s.mu.Unlock()
		return nil, errors.New("Azure Bastion is cloud-only; switch to a cloud Azure profile")
	}
	s.mu.Unlock()

	vm, err := s.activeAzureVMByID(snapshot, session, request.VMID)
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

	azPath := s.azureProviderCommandPath(snapshot)
	if azPath == "" {
		return nil, errors.New("Azure CLI was not detected; install az and sign in, then retry")
	}

	protocol, args, err := bastionConnectArgs(
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

	cmdCommand, psCommand := formatBastionConnectCommands(s.settings.PlatformName, azPath, args)
	result := models.AzureBastionConnectResult{
		Command:           cmdCommand,
		PowerShellCommand: psCommand,
		Launched:          false,
		Protocol:          protocol,
	}
	if request.Launch {
		timeoutCtx, cancel := context.WithTimeout(ctx, defaultAzureInventoryTimeout)
		defer cancel()
		if err := sysproc.SpawnInteractiveConsole(timeoutCtx, azPath, args...); err != nil {
			return nil, fmt.Errorf("launch Bastion session: %w", err)
		}
		result.Launched = true
		if notifier != nil {
			_ = notifier.Notify("log.appended", models.ActivityLogEntry{
				Level:     "info",
				Message:   fmt.Sprintf("Launched Bastion %s session to %s.", protocol, vm.Name),
				Timestamp: s.timestamp(),
			})
		}
	}
	return result, nil
}

func (s *Service) activeAzureVMByID(
	snapshot discovery.Snapshot,
	session models.SessionSnapshot,
	vmID string,
) (models.AzureVirtualMachine, error) {
	profile, ok := findProfile(filterProfiles(snapshot.Profiles, session.CurrentProviderID), session.SelectedProfileID)
	if !ok {
		return models.AzureVirtualMachine{}, errors.New("the workspace's Azure profile is not available")
	}
	targetID := strings.TrimSpace(vmID)
	if targetID == "" {
		targetID = session.SelectedAzureVMID
	}
	resourceGroup := session.SelectedAzureResourceGroup
	if resourceGroup == "" {
		return models.AzureVirtualMachine{}, errors.New("select a resource group before connecting to a virtual machine")
	}
	vms := s.azureVirtualMachines(context.Background(), profile, resourceGroup)
	for _, vm := range vms {
		if vm.VMID == targetID || vm.Name == targetID {
			return vm, nil
		}
	}
	return models.AzureVirtualMachine{}, fmt.Errorf("virtual machine %s was not found in %s", targetID, resourceGroup)
}

func bastionConnectArgs(
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

	if isWindowsVM(vm) {
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

func isWindowsVM(vm models.AzureVirtualMachine) bool {
	return strings.EqualFold(strings.TrimSpace(vm.OSType), "Windows")
}

func formatBastionConnectCommands(platform string, command string, args []string) (cmd string, powershell string) {
	switch strings.ToLower(strings.TrimSpace(platform)) {
	case "windows":
		return sysproc.BuildWindowsCmdLine(command, args...), sysproc.BuildWindowsPowerShellLine(command, args...)
	default:
		return sysproc.BuildWindowsCmdLine(command, args...), ""
	}
}
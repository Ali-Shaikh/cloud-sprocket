// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package azureadapter

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"cloudsprocket/backend/daemon/internal/models"
)

type cliExtensionRequirement struct {
	Name    string
	Summary string
}

// requiredCLIExtensions lists Azure CLI extensions CloudSprocket invokes for
// cloud profiles. Core commands (group, vm, storage, and so on) ship with az;
// these extensions cover Log Analytics, Bastion, and Front Door WAF workbenches.
var requiredCLIExtensions = []cliExtensionRequirement{
	{
		Name:    "log-analytics",
		Summary: "Log Analytics workspaces, tables, and KQL queries",
	},
	{
		Name:    "bastion",
		Summary: "Azure Bastion host listing and tunnel sessions",
	},
	{
		Name:    "front-door",
		Summary: "Front Door WAF policy configuration and logs",
	},
}

// CheckCLIExtensions reports whether each required Azure CLI extension is
// installed. When az is missing or extension list fails, every requirement is
// returned as not installed so the desktop UI can surface install guidance.
func (i *Inventory) CheckCLIExtensions(ctx context.Context) []models.AzureCLIExtensionStatus {
	installed, listErr := i.listInstalledExtensions(ctx)
	statuses := make([]models.AzureCLIExtensionStatus, 0, len(requiredCLIExtensions))
	for _, requirement := range requiredCLIExtensions {
		status := models.AzureCLIExtensionStatus{
			Name:           requirement.Name,
			Summary:        requirement.Summary,
			InstallCommand: "az extension add --name " + requirement.Name,
			Installed:      installed[strings.ToLower(requirement.Name)],
		}
		if listErr != nil {
			status.Summary = requirement.Summary + " (could not query installed extensions)"
		}
		statuses = append(statuses, status)
	}
	return statuses
}

func (i *Inventory) listInstalledExtensions(ctx context.Context) (map[string]bool, error) {
	runner := i.runner
	if runner == nil {
		runner = execRunner{}
	}
	payload, err := runner.CommandContext(ctx, "az", "extension", "list", "--output", "json", "--only-show-errors")
	if err != nil {
		return nil, fmt.Errorf("az extension list: %w", err)
	}
	var decoded []struct {
		Name string `json:"name"`
	}
	if err := json.Unmarshal(payload, &decoded); err != nil {
		return nil, fmt.Errorf("decode az extension list: %w", err)
	}
	installed := make(map[string]bool, len(decoded))
	for _, item := range decoded {
		name := strings.ToLower(strings.TrimSpace(item.Name))
		if name != "" {
			installed[name] = true
		}
	}
	return installed, nil
}
package azureadapter

import (
	"context"
	"encoding/json"
	"fmt"
	"sort"
	"strings"

	"cloudsprocket/backend/daemon/internal/models"
)

func (i *Inventory) ListWebApps(
	ctx context.Context,
	profile models.ProfileSummary,
	resourceGroup string,
) ([]models.AzureWebApp, error) {
	if isLocalFlociProfile(profile) {
		return nil, fmt.Errorf("app service is not emulated by floci-az; use a cloud Azure profile or deploy Azure Functions locally")
	}
	resourceGroup = strings.TrimSpace(resourceGroup)
	args := []string{
		"webapp", "list",
		"--subscription", profile.ProfileID,
		"--output", "json",
		"--only-show-errors",
	}
	if resourceGroup != "" {
		args = append(args, "--resource-group", resourceGroup)
	}
	payload, err := i.run(ctx, args...)
	if err != nil {
		return nil, err
	}
	var decoded []struct {
		Name          string `json:"name"`
		ResourceGroup string `json:"resourceGroup"`
		Location      string `json:"location"`
		State         string `json:"state"`
		DefaultHostName string `json:"defaultHostName"`
		Kind          string `json:"kind"`
		HTTPSOnly     bool   `json:"httpsOnly"`
	}
	if err := json.Unmarshal(payload, &decoded); err != nil {
		return nil, fmt.Errorf("decode azure web apps: %w", err)
	}
	apps := make([]models.AzureWebApp, 0, len(decoded))
	for _, item := range decoded {
		apps = append(apps, models.AzureWebApp{
			Name:            item.Name,
			ResourceGroup:   item.ResourceGroup,
			Location:        item.Location,
			State:           item.State,
			DefaultHostName: item.DefaultHostName,
			Kind:            item.Kind,
			HTTPSOnly:       item.HTTPSOnly,
		})
	}
	sort.Slice(apps, func(left int, right int) bool {
		return strings.ToLower(apps[left].Name) < strings.ToLower(apps[right].Name)
	})
	return apps, nil
}

func (i *Inventory) CreateWebApp(
	ctx context.Context,
	profile models.ProfileSummary,
	resourceGroup string,
	appName string,
	location string,
	runtime string,
) (models.AzureWebApp, error) {
	if isLocalFlociProfile(profile) {
		return models.AzureWebApp{}, fmt.Errorf("app service create is not supported on the floci-az local profile")
	}
	resourceGroup = strings.TrimSpace(resourceGroup)
	appName = strings.TrimSpace(appName)
	location = strings.TrimSpace(location)
	runtime = strings.TrimSpace(runtime)
	if resourceGroup == "" || appName == "" {
		return models.AzureWebApp{}, fmt.Errorf("resource group and app name are required")
	}
	if location == "" {
		location = "westeurope"
	}
	if runtime == "" {
		runtime = "NODE:22-lts"
	}
	planName := appName + "-plan"
	planArgs := []string{
		"appservice", "plan", "create",
		"--subscription", profile.ProfileID,
		"--resource-group", resourceGroup,
		"--name", planName,
		"--location", location,
		"--sku", "F1",
		"--is-linux",
		"--only-show-errors",
	}
	if _, err := i.run(ctx, planArgs...); err != nil {
		return models.AzureWebApp{}, fmt.Errorf("create app service plan: %w", err)
	}
	webArgs := []string{
		"webapp", "create",
		"--subscription", profile.ProfileID,
		"--resource-group", resourceGroup,
		"--plan", planName,
		"--name", appName,
		"--runtime", runtime,
		"--output", "json",
		"--only-show-errors",
	}
	payload, err := i.run(ctx, webArgs...)
	if err != nil {
		return models.AzureWebApp{}, err
	}
	var decoded struct {
		Name            string `json:"name"`
		ResourceGroup   string `json:"resourceGroup"`
		Location        string `json:"location"`
		State           string `json:"state"`
		DefaultHostName string `json:"defaultHostName"`
		Kind            string `json:"kind"`
		HTTPSOnly       bool   `json:"httpsOnly"`
	}
	if err := json.Unmarshal(payload, &decoded); err != nil {
		return models.AzureWebApp{}, fmt.Errorf("decode azure web app create: %w", err)
	}
	return models.AzureWebApp{
		Name:            decoded.Name,
		ResourceGroup:   decoded.ResourceGroup,
		Location:        decoded.Location,
		State:           decoded.State,
		DefaultHostName: decoded.DefaultHostName,
		Kind:            decoded.Kind,
		HTTPSOnly:       decoded.HTTPSOnly,
	}, nil
}
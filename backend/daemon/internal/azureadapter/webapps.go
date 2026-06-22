// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package azureadapter

import (
	"bytes"
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
		Name            string `json:"name"`
		ResourceGroup   string `json:"resourceGroup"`
		Location        string `json:"location"`
		State           string `json:"state"`
		DefaultHostName string `json:"defaultHostName"`
		Kind            string `json:"kind"`
		HTTPSOnly       bool   `json:"httpsOnly"`
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

func appendWebAppDeploymentSlotArg(args []string, slotName string) []string {
	slotName = strings.TrimSpace(slotName)
	if slotName == "" || strings.EqualFold(slotName, "production") {
		return args
	}
	return append(args, "--slot", slotName)
}

func (i *Inventory) ListWebAppDeploymentSlots(
	ctx context.Context,
	profile models.ProfileSummary,
	resourceGroup string,
	appName string,
) ([]models.AzureWebAppDeploymentSlot, error) {
	if isLocalFlociProfile(profile) {
		return nil, fmt.Errorf("app service deployment slots are not supported on the floci-az local profile")
	}
	resourceGroup = strings.TrimSpace(resourceGroup)
	appName = strings.TrimSpace(appName)
	if resourceGroup == "" || appName == "" {
		return []models.AzureWebAppDeploymentSlot{}, nil
	}
	args := []string{
		"webapp", "deployment", "slot", "list",
		"--subscription", profile.ProfileID,
		"--resource-group", resourceGroup,
		"--name", appName,
		"--output", "json",
		"--only-show-errors",
	}
	payload, err := i.run(ctx, args...)
	if err != nil {
		return nil, err
	}
	var decoded []struct {
		Name            string `json:"name"`
		Status          string `json:"status"`
		DefaultHostName string `json:"defaultHostName"`
		TrafficPercent  int    `json:"trafficPercent"`
	}
	if err := json.Unmarshal(payload, &decoded); err != nil {
		return nil, fmt.Errorf("decode web app deployment slots: %w", err)
	}
	slots := make([]models.AzureWebAppDeploymentSlot, 0, len(decoded))
	for _, item := range decoded {
		slots = append(slots, models.AzureWebAppDeploymentSlot{
			Name:            item.Name,
			Status:          item.Status,
			DefaultHostName: item.DefaultHostName,
			TrafficPercent:  item.TrafficPercent,
		})
	}
	sort.Slice(slots, func(left int, right int) bool {
		return strings.ToLower(slots[left].Name) < strings.ToLower(slots[right].Name)
	})
	return slots, nil
}

func (i *Inventory) CreateWebApp(
	ctx context.Context,
	profile models.ProfileSummary,
	resourceGroup string,
	appName string,
	location string,
	runtime string,
	existingPlanName string,
	newPlanName string,
	planSKU string,
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
	planName := strings.TrimSpace(existingPlanName)
	if planName == "" {
		planName = strings.TrimSpace(newPlanName)
		if planName == "" {
			planName = appName + "-plan"
		}
		sku := strings.TrimSpace(planSKU)
		if sku == "" {
			sku = "F1"
		}
		planArgs := []string{
			"appservice", "plan", "create",
			"--subscription", profile.ProfileID,
			"--resource-group", resourceGroup,
			"--name", planName,
			"--location", location,
			"--sku", sku,
			"--is-linux",
			"--only-show-errors",
		}
		if _, err := i.run(ctx, planArgs...); err != nil {
			return models.AzureWebApp{}, fmt.Errorf("create app service plan: %w", err)
		}
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

func (i *Inventory) GetWebApp(
	ctx context.Context,
	profile models.ProfileSummary,
	resourceGroup string,
	appName string,
) (models.AzureWebApp, error) {
	if isLocalFlociProfile(profile) {
		return models.AzureWebApp{}, fmt.Errorf("app service is not emulated by floci-az")
	}
	resourceGroup = strings.TrimSpace(resourceGroup)
	appName = strings.TrimSpace(appName)
	if resourceGroup == "" || appName == "" {
		return models.AzureWebApp{}, fmt.Errorf("resource group and app name are required")
	}
	args := []string{
		"webapp", "show",
		"--subscription", profile.ProfileID,
		"--resource-group", resourceGroup,
		"--name", appName,
		"--output", "json",
		"--only-show-errors",
	}
	payload, err := i.run(ctx, args...)
	if err != nil {
		return models.AzureWebApp{}, err
	}
	var decoded struct {
		Name                string `json:"name"`
		ResourceGroup       string `json:"resourceGroup"`
		Location            string `json:"location"`
		State               string `json:"state"`
		DefaultHostName     string `json:"defaultHostName"`
		Kind                string `json:"kind"`
		HTTPSOnly           bool   `json:"httpsOnly"`
		OutboundIPAddresses string `json:"outboundIpAddresses"`
		ServerFarmID        string `json:"serverFarmId"`
		Identity            struct {
			Type        string `json:"type"`
			PrincipalID string `json:"principalId"`
		} `json:"identity"`
		SiteConfig struct {
			LinuxFxVersion   string `json:"linuxFxVersion"`
			WindowsFxVersion string `json:"windowsFxVersion"`
		} `json:"siteConfig"`
	}
	if err := json.Unmarshal(payload, &decoded); err != nil {
		return models.AzureWebApp{}, fmt.Errorf("decode azure web app show: %w", err)
	}
	runtime := firstNonEmpty(decoded.SiteConfig.LinuxFxVersion, decoded.SiteConfig.WindowsFxVersion)
	planResourceGroup, planName := planIdentityFromServerFarmID(decoded.ServerFarmID)
	return models.AzureWebApp{
		Name:                        decoded.Name,
		ResourceGroup:               decoded.ResourceGroup,
		Location:                    decoded.Location,
		State:                       decoded.State,
		DefaultHostName:             decoded.DefaultHostName,
		Kind:                        decoded.Kind,
		HTTPSOnly:                   decoded.HTTPSOnly,
		AppServicePlan:              planName,
		AppServicePlanResourceGroup: planResourceGroup,
		Runtime:                     runtime,
		OutboundIPs:                 decoded.OutboundIPAddresses,
		IdentityType:                decoded.Identity.Type,
		IdentityPrincipalID:         decoded.Identity.PrincipalID,
	}, nil
}

func (i *Inventory) ListAppServicePlans(
	ctx context.Context,
	profile models.ProfileSummary,
	resourceGroup string,
) ([]models.AzureAppServicePlan, error) {
	if isLocalFlociProfile(profile) {
		return nil, fmt.Errorf("app service is not emulated by floci-az")
	}
	args := []string{
		"appservice", "plan", "list",
		"--subscription", profile.ProfileID,
		"--output", "json",
		"--only-show-errors",
	}
	if strings.TrimSpace(resourceGroup) != "" {
		args = append(args, "--resource-group", strings.TrimSpace(resourceGroup))
	}
	payload, err := i.run(ctx, args...)
	if err != nil {
		return nil, err
	}
	var decoded []struct {
		Name            string `json:"name"`
		ResourceGroup   string `json:"resourceGroup"`
		Location        string `json:"location"`
		Kind            string `json:"kind"`
		Status          string `json:"status"`
		NumberOfWorkers int    `json:"numberOfWorkers"`
		SKU             struct {
			Name string `json:"name"`
			Tier string `json:"tier"`
		} `json:"sku"`
	}
	if err := json.Unmarshal(payload, &decoded); err != nil {
		return nil, fmt.Errorf("decode app service plans: %w", err)
	}
	plans := make([]models.AzureAppServicePlan, 0, len(decoded))
	for _, item := range decoded {
		sku := strings.TrimSpace(item.SKU.Tier)
		if skuName := strings.TrimSpace(item.SKU.Name); skuName != "" {
			if sku != "" {
				sku = skuName + " (" + sku + ")"
			} else {
				sku = skuName
			}
		}
		plans = append(plans, models.AzureAppServicePlan{
			Name:            item.Name,
			ResourceGroup:   item.ResourceGroup,
			Location:        item.Location,
			SKU:             sku,
			Kind:            item.Kind,
			Status:          item.Status,
			NumberOfWorkers: item.NumberOfWorkers,
		})
	}
	sort.Slice(plans, func(left int, right int) bool {
		return strings.ToLower(plans[left].Name) < strings.ToLower(plans[right].Name)
	})
	return plans, nil
}

func (i *Inventory) GetAppServicePlan(
	ctx context.Context,
	profile models.ProfileSummary,
	resourceGroup string,
	planName string,
) (models.AzureAppServicePlan, error) {
	if isLocalFlociProfile(profile) {
		return models.AzureAppServicePlan{}, fmt.Errorf("app service is not emulated by floci-az")
	}
	resourceGroup = strings.TrimSpace(resourceGroup)
	planName = strings.TrimSpace(planName)
	if resourceGroup == "" || planName == "" {
		return models.AzureAppServicePlan{}, fmt.Errorf("resource group and plan name are required")
	}
	args := []string{
		"appservice", "plan", "show",
		"--subscription", profile.ProfileID,
		"--resource-group", resourceGroup,
		"--name", planName,
		"--output", "json",
		"--only-show-errors",
	}
	payload, err := i.run(ctx, args...)
	if err != nil {
		return models.AzureAppServicePlan{}, err
	}
	var decoded struct {
		Name            string `json:"name"`
		ResourceGroup   string `json:"resourceGroup"`
		Location        string `json:"location"`
		Kind            string `json:"kind"`
		Status          string `json:"status"`
		NumberOfWorkers int    `json:"numberOfWorkers"`
		SKU             struct {
			Name string `json:"name"`
			Tier string `json:"tier"`
		} `json:"sku"`
	}
	if err := json.Unmarshal(payload, &decoded); err != nil {
		return models.AzureAppServicePlan{}, fmt.Errorf("decode app service plan show: %w", err)
	}
	sku := strings.TrimSpace(decoded.SKU.Tier)
	if skuName := strings.TrimSpace(decoded.SKU.Name); skuName != "" {
		if sku != "" {
			sku = skuName + " (" + sku + ")"
		} else {
			sku = skuName
		}
	}
	return models.AzureAppServicePlan{
		Name:            decoded.Name,
		ResourceGroup:   decoded.ResourceGroup,
		Location:        decoded.Location,
		SKU:             sku,
		Kind:            decoded.Kind,
		Status:          decoded.Status,
		NumberOfWorkers: decoded.NumberOfWorkers,
	}, nil
}

func (i *Inventory) ListWebAppSettings(
	ctx context.Context,
	profile models.ProfileSummary,
	resourceGroup string,
	appName string,
	slotName string,
) ([]models.AzureWebAppSetting, error) {
	if isLocalFlociProfile(profile) {
		return nil, fmt.Errorf("app service is not emulated by floci-az")
	}
	resourceGroup = strings.TrimSpace(resourceGroup)
	appName = strings.TrimSpace(appName)
	if resourceGroup == "" || appName == "" {
		return nil, fmt.Errorf("resource group and app name are required")
	}
	args := appendWebAppDeploymentSlotArg([]string{
		"webapp", "config", "appsettings", "list",
		"--subscription", profile.ProfileID,
		"--resource-group", resourceGroup,
		"--name", appName,
		"--output", "json",
		"--only-show-errors",
	}, slotName)
	payload, err := i.run(ctx, args...)
	if err != nil {
		return nil, err
	}
	settings, err := decodeWebAppSettings(payload)
	if err != nil {
		return nil, err
	}
	sort.Slice(settings, func(left int, right int) bool {
		return strings.ToLower(settings[left].Name) < strings.ToLower(settings[right].Name)
	})
	return settings, nil
}

func (i *Inventory) SetWebAppSetting(
	ctx context.Context,
	profile models.ProfileSummary,
	resourceGroup string,
	appName string,
	name string,
	value string,
	slotSetting bool,
	slotName string,
) error {
	if isLocalFlociProfile(profile) {
		return fmt.Errorf("app service settings are not supported on the floci-az local profile")
	}
	resourceGroup = strings.TrimSpace(resourceGroup)
	appName = strings.TrimSpace(appName)
	name = strings.TrimSpace(name)
	if resourceGroup == "" || appName == "" || name == "" {
		return fmt.Errorf("resource group, app name, and setting name are required")
	}
	settingArg := name + "=" + value
	args := appendWebAppDeploymentSlotArg([]string{
		"webapp", "config", "appsettings", "set",
		"--subscription", profile.ProfileID,
		"--resource-group", resourceGroup,
		"--name", appName,
		"--output", "none",
		"--only-show-errors",
	}, slotName)
	if slotSetting {
		args = append(args, "--slot-settings", settingArg)
	} else {
		args = append(args, "--settings", settingArg)
	}
	_, err := i.run(ctx, args...)
	return err
}

func (i *Inventory) DeleteWebAppSetting(
	ctx context.Context,
	profile models.ProfileSummary,
	resourceGroup string,
	appName string,
	name string,
	slotName string,
) error {
	if isLocalFlociProfile(profile) {
		return fmt.Errorf("app service settings are not supported on the floci-az local profile")
	}
	resourceGroup = strings.TrimSpace(resourceGroup)
	appName = strings.TrimSpace(appName)
	name = strings.TrimSpace(name)
	if resourceGroup == "" || appName == "" || name == "" {
		return fmt.Errorf("resource group, app name, and setting name are required")
	}
	args := appendWebAppDeploymentSlotArg([]string{
		"webapp", "config", "appsettings", "delete",
		"--subscription", profile.ProfileID,
		"--resource-group", resourceGroup,
		"--name", appName,
		"--setting-names", name,
		"--output", "none",
		"--only-show-errors",
	}, slotName)
	_, err := i.run(ctx, args...)
	return err
}

func (i *Inventory) InvokeWebAppAction(
	ctx context.Context,
	profile models.ProfileSummary,
	resourceGroup string,
	appName string,
	action string,
	slotName string,
) error {
	if isLocalFlociProfile(profile) {
		return fmt.Errorf("app service actions are not supported on the floci-az local profile")
	}
	resourceGroup = strings.TrimSpace(resourceGroup)
	appName = strings.TrimSpace(appName)
	action = strings.ToLower(strings.TrimSpace(action))
	switch action {
	case "start", "stop", "restart":
	default:
		return fmt.Errorf("unsupported web app action %q", action)
	}
	args := appendWebAppDeploymentSlotArg([]string{
		"webapp", action,
		"--subscription", profile.ProfileID,
		"--resource-group", resourceGroup,
		"--name", appName,
		"--only-show-errors",
	}, slotName)
	_, err := i.run(ctx, args...)
	return err
}

func planIdentityFromServerFarmID(serverFarmID string) (resourceGroup string, planName string) {
	serverFarmID = strings.TrimSpace(serverFarmID)
	if serverFarmID == "" {
		return "", ""
	}
	parts := strings.Split(serverFarmID, "/")
	for index := 0; index < len(parts)-1; index++ {
		if strings.EqualFold(strings.TrimSpace(parts[index]), "resourceGroups") {
			resourceGroup = strings.TrimSpace(parts[index+1])
			break
		}
	}
	return resourceGroup, planNameFromServerFarmID(serverFarmID)
}

func planNameFromServerFarmID(serverFarmID string) string {
	serverFarmID = strings.TrimSpace(serverFarmID)
	if serverFarmID == "" {
		return ""
	}
	parts := strings.Split(serverFarmID, "/")
	for index := len(parts) - 1; index >= 0; index-- {
		if strings.TrimSpace(parts[index]) != "" {
			return parts[index]
		}
	}
	return serverFarmID
}

func decodeWebAppSettings(payload []byte) ([]models.AzureWebAppSetting, error) {
	payload = bytes.TrimSpace(payload)
	if len(payload) == 0 || string(payload) == "null" {
		return []models.AzureWebAppSetting{}, nil
	}
	type settingRow struct {
		Name        string `json:"name"`
		Value       string `json:"value"`
		SlotSetting bool   `json:"slotSetting"`
	}
	var decoded []settingRow
	if err := json.Unmarshal(payload, &decoded); err == nil {
		settings := make([]models.AzureWebAppSetting, 0, len(decoded))
		for _, item := range decoded {
			settings = append(settings, models.AzureWebAppSetting{
				Name:        item.Name,
				Value:       item.Value,
				SlotSetting: item.SlotSetting,
			})
		}
		return settings, nil
	}
	var keyed map[string]string
	if err := json.Unmarshal(payload, &keyed); err == nil && len(keyed) > 0 {
		settings := make([]models.AzureWebAppSetting, 0, len(keyed))
		for name, value := range keyed {
			settings = append(settings, models.AzureWebAppSetting{
				Name:  name,
				Value: value,
			})
		}
		sort.Slice(settings, func(left int, right int) bool {
			return strings.ToLower(settings[left].Name) < strings.ToLower(settings[right].Name)
		})
		return settings, nil
	}
	return nil, fmt.Errorf("decode web app settings: unsupported payload")
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return strings.TrimSpace(value)
		}
	}
	return ""
}

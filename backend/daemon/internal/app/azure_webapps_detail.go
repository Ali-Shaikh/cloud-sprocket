// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package app

import (
	"context"
	"fmt"
	"strings"
	"sync"

	"cloudsprocket/backend/daemon/internal/models"
)

func (s *Service) enrichAzureWebAppDetail(workspace *models.WorkspaceSnapshot, session models.SessionSnapshot, mu *sync.Mutex) {
	if workspace.Provider == nil ||
		workspace.Provider.ProviderID != "azure" ||
		workspace.Profile == nil ||
		s.azure == nil {
		return
	}
	appName := strings.TrimSpace(workspace.SelectedAzureWebAppName)
	if appName == "" {
		appName = strings.TrimSpace(session.SelectedAzureWebAppName)
	}
	resourceGroup := strings.TrimSpace(workspace.SelectedAzureResourceGroup)
	if resourceGroup == "" {
		resourceGroup = s.selectedAzureResourceGroup(session, workspace.AzureResourceGroups)
	}
	if appName == "" || resourceGroup == "" {
		lockWorkspace(mu, func() {
			workspace.AzureAppServicePlans = nil
			workspace.AzureWebAppSettings = nil
			workspace.AzureWebAppDeploymentSlots = nil
			workspace.AzureWebAppActiveDetail = nil
		})
		return
	}

	profile := *workspace.Profile

	slotsCtx, slotsCancel := s.withAzureTimeout(context.Background())
	defer slotsCancel()
	slots, slotsErr := s.azure.ListWebAppDeploymentSlots(slotsCtx, profile, resourceGroup, appName)
	slotName := selectedAzureWebAppSlot(session, slots)

	detailCtx, detailCancel := s.withAzureTimeout(context.Background())
	defer detailCancel()

	detail, detailErr := s.azure.GetWebApp(detailCtx, profile, resourceGroup, appName, slotName)

	plansCtx, plansCancel := s.withAzureTimeout(context.Background())
	defer plansCancel()
	plans, plansErr := s.azure.ListAppServicePlans(plansCtx, profile, resourceGroup)

	settingsCtx, settingsCancel := s.withAzureTimeout(context.Background())
	defer settingsCancel()
	settings, settingsErr := s.azure.ListWebAppSettings(settingsCtx, profile, resourceGroup, appName, slotName)

	if detailErr == nil {
		plans = s.mergeAzureAppServicePlans(plans, detail, profile)
		for index, plan := range plans {
			if plan.Name == detail.AppServicePlan {
				detail.PlanSKU = plan.SKU
				plans[index] = plan
				break
			}
		}
	}

	detailStatus := azureWebAppDetailStatusMessage(appName, slotName, slots, plans, settings, detailErr, slotsErr, plansErr, settingsErr)

	lockWorkspace(mu, func() {
		workspace.AzureAppServicePlans = plans
		workspace.AzureWebAppDeploymentSlots = slots
		workspace.SelectedAzureWebAppSlot = slotName
		workspace.AzureWebAppSettings = settings
		if strings.TrimSpace(workspace.AzureAppServiceStatusMessage) != "" {
			workspace.AzureAppServiceStatusMessage = strings.TrimSpace(workspace.AzureAppServiceStatusMessage) + " " + detailStatus
		} else {
			workspace.AzureAppServiceStatusMessage = detailStatus
		}
		if detailErr == nil {
			workspace.AzureWebAppActiveDetail = &detail
			if slotName == "" {
				for index, app := range workspace.AzureWebApps {
					if app.Name == appName {
						workspace.AzureWebApps[index] = detail
						break
					}
				}
			}
		} else {
			workspace.AzureWebAppActiveDetail = nil
		}
	})
}

func (s *Service) mergeAzureAppServicePlans(
	plans []models.AzureAppServicePlan,
	detail models.AzureWebApp,
	profile models.ProfileSummary,
) []models.AzureAppServicePlan {
	if detail.AppServicePlan == "" {
		return plans
	}
	for _, plan := range plans {
		if plan.Name == detail.AppServicePlan {
			return plans
		}
	}
	planResourceGroup := strings.TrimSpace(detail.AppServicePlanResourceGroup)
	if planResourceGroup == "" {
		planResourceGroup = strings.TrimSpace(detail.ResourceGroup)
	}
	if planResourceGroup == "" {
		return plans
	}
	planCtx, planCancel := s.withAzureTimeout(context.Background())
	defer planCancel()
	plan, err := s.azure.GetAppServicePlan(planCtx, profile, planResourceGroup, detail.AppServicePlan)
	if err != nil {
		return plans
	}
	return append(plans, plan)
}

func selectedAzureWebAppSlot(session models.SessionSnapshot, slots []models.AzureWebAppDeploymentSlot) string {
	slotName := strings.TrimSpace(session.SelectedAzureWebAppSlot)
	if slotName == "" || strings.EqualFold(slotName, "production") {
		return ""
	}
	for _, slot := range slots {
		if slot.Name == slotName {
			return slotName
		}
	}
	return ""
}

func azureWebAppDetailStatusMessage(
	appName string,
	slotName string,
	slots []models.AzureWebAppDeploymentSlot,
	plans []models.AzureAppServicePlan,
	settings []models.AzureWebAppSetting,
	detailErr error,
	slotsErr error,
	plansErr error,
	settingsErr error,
) string {
	parts := make([]string, 0, 6)
	slotLabel := "production"
	if slotName != "" {
		slotLabel = slotName
	}
	if detailErr != nil {
		parts = append(parts, fmt.Sprintf("Could not load detail for %s: %v.", appName, detailErr))
	} else {
		parts = append(parts, fmt.Sprintf("Loaded detail for %s (%s slot).", appName, slotLabel))
	}
	if slotsErr != nil {
		parts = append(parts, fmt.Sprintf("Deployment slots unavailable: %v.", slotsErr))
	} else {
		parts = append(parts, fmt.Sprintf("%d deployment slot(s).", len(slots)))
	}
	if plansErr != nil {
		parts = append(parts, fmt.Sprintf("App Service plans unavailable: %v.", plansErr))
	} else {
		parts = append(parts, fmt.Sprintf("%d App Service plan(s).", len(plans)))
	}
	if settingsErr != nil {
		parts = append(parts, fmt.Sprintf("Application settings unavailable: %v.", settingsErr))
	} else {
		parts = append(parts, fmt.Sprintf("%d application setting(s) for %s.", len(settings), slotLabel))
	}
	return strings.Join(parts, " ")
}

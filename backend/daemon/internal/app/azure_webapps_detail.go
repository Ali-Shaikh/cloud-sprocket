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
		})
		return
	}

	profile := *workspace.Profile

	detailCtx, detailCancel := s.withAzureTimeout(context.Background())
	defer detailCancel()
	detail, detailErr := s.azure.GetWebApp(detailCtx, profile, resourceGroup, appName)

	plansCtx, plansCancel := s.withAzureTimeout(context.Background())
	defer plansCancel()
	plans, plansErr := s.azure.ListAppServicePlans(plansCtx, profile, resourceGroup)

	settingsCtx, settingsCancel := s.withAzureTimeout(context.Background())
	defer settingsCancel()
	settings, settingsErr := s.azure.ListWebAppSettings(settingsCtx, profile, resourceGroup, appName)

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

	detailStatus := azureWebAppDetailStatusMessage(appName, plans, settings, detailErr, plansErr, settingsErr)

	lockWorkspace(mu, func() {
		workspace.AzureAppServicePlans = plans
		workspace.AzureWebAppSettings = settings
		if strings.TrimSpace(workspace.AzureAppServiceStatusMessage) != "" {
			workspace.AzureAppServiceStatusMessage = strings.TrimSpace(workspace.AzureAppServiceStatusMessage) + " " + detailStatus
		} else {
			workspace.AzureAppServiceStatusMessage = detailStatus
		}
		if detailErr == nil {
			for index, app := range workspace.AzureWebApps {
				if app.Name == appName {
					workspace.AzureWebApps[index] = detail
					break
				}
			}
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

func azureWebAppDetailStatusMessage(
	appName string,
	plans []models.AzureAppServicePlan,
	settings []models.AzureWebAppSetting,
	detailErr error,
	plansErr error,
	settingsErr error,
) string {
	parts := make([]string, 0, 4)
	if detailErr != nil {
		parts = append(parts, fmt.Sprintf("Could not load detail for %s: %v.", appName, detailErr))
	} else {
		parts = append(parts, fmt.Sprintf("Loaded detail for %s.", appName))
	}
	if plansErr != nil {
		parts = append(parts, fmt.Sprintf("App Service plans unavailable: %v.", plansErr))
	} else {
		parts = append(parts, fmt.Sprintf("%d App Service plan(s).", len(plans)))
	}
	if settingsErr != nil {
		parts = append(parts, fmt.Sprintf("Application settings unavailable: %v.", settingsErr))
	} else {
		parts = append(parts, fmt.Sprintf("%d application setting(s).", len(settings)))
	}
	return strings.Join(parts, " ")
}

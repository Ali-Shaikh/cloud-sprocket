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
)

// HandleKeyVaultRevealSecret implements azure.keyVault.revealSecret.
func (s *Service) HandleKeyVaultRevealSecret(ctx context.Context, params json.RawMessage, _ sessionport.Notifier) (any, error) {
	if s == nil || s.keyVault == nil || s.session == nil || s.discovery == nil {
		return nil, errors.New("azure write service is not available")
	}
	var request struct {
		VaultName  string `json:"vaultName"`
		SecretName string `json:"secretName"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	if strings.TrimSpace(request.VaultName) == "" || strings.TrimSpace(request.SecretName) == "" {
		return nil, errors.New("a key vault and secret name are required")
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

	actionCtx, cancel := s.WithActionTimeout(ctx)
	value, err := s.keyVault.GetKeyVaultSecret(actionCtx, profile, request.VaultName, request.SecretName)
	cancel()
	if err != nil {
		return nil, err
	}
	return map[string]string{"value": value}, nil
}

// HandleKeyVaultSetSecret implements azure.keyVault.setSecret.
func (s *Service) HandleKeyVaultSetSecret(ctx context.Context, params json.RawMessage, notifier sessionport.Notifier) (any, error) {
	if s == nil || s.keyVault == nil {
		return nil, errors.New("azure write service is not available")
	}
	var request struct {
		VaultName  string `json:"vaultName"`
		SecretName string `json:"secretName"`
		Value      string `json:"value"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	vaultName := strings.TrimSpace(request.VaultName)
	secretName := strings.TrimSpace(request.SecretName)
	if vaultName == "" || secretName == "" {
		return nil, errors.New("a key vault and secret name are required")
	}
	snapshot, err := s.discovery.Discover()
	if err != nil {
		return nil, err
	}
	_, profile, err := s.AuthorizeWrite(
		ctx, snapshot,
		"open a locked Azure workspace before setting a secret",
		"setting a secret requires write mode to be enabled for this Azure workspace",
	)
	if err != nil {
		return nil, err
	}

	actionCtx, cancel := s.WithActionTimeout(ctx)
	_, err = s.keyVault.SetKeyVaultSecret(actionCtx, profile, vaultName, secretName, request.Value)
	cancel()
	if err != nil {
		return nil, err
	}

	return s.FinishWriteAction(
		ctx, snapshot, notifier, sessionport.SnapshotOptions{AzureScope: "keyvault"},
		fmt.Sprintf("Set secret %s.", secretName),
		func(session *models.SessionSnapshot) {
			session.SelectedAzureKeyVault = vaultName
			session.SelectedAzureSecret = secretName
		},
	)
}

// HandlePostgresStartServer implements azure.postgres.startServer.
func (s *Service) HandlePostgresStartServer(ctx context.Context, params json.RawMessage, notifier sessionport.Notifier) (any, error) {
	return s.handlePostgresLifecycle(ctx, params, notifier, "start")
}

// HandlePostgresStopServer implements azure.postgres.stopServer.
func (s *Service) HandlePostgresStopServer(ctx context.Context, params json.RawMessage, notifier sessionport.Notifier) (any, error) {
	return s.handlePostgresLifecycle(ctx, params, notifier, "stop")
}

func (s *Service) handlePostgresLifecycle(
	ctx context.Context,
	params json.RawMessage,
	notifier sessionport.Notifier,
	action string,
) (any, error) {
	if s == nil || s.postgres == nil {
		return nil, errors.New("azure write service is not available")
	}
	var request struct {
		Server        string `json:"server"`
		ResourceGroup string `json:"resourceGroup"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	serverName := strings.TrimSpace(request.Server)
	resourceGroup := strings.TrimSpace(request.ResourceGroup)
	if serverName == "" {
		return nil, errors.New("a server name is required")
	}
	snapshot, err := s.discovery.Discover()
	if err != nil {
		return nil, err
	}
	session, profile, err := s.AuthorizeWrite(
		ctx, snapshot,
		"open a locked Azure workspace before managing a PostgreSQL server",
		"PostgreSQL server actions require write mode to be enabled for this Azure workspace",
	)
	if err != nil {
		return nil, err
	}
	selectedServer := session.SelectedAzurePostgresServer

	if resourceGroup == "" {
		listCtx, listCancel := s.WithActionTimeout(ctx)
		servers, listErr := s.postgres.ListPostgresServers(listCtx, profile)
		listCancel()
		if listErr == nil {
			resourceGroup = ResourceGroupForPostgresServer(servers, serverName)
			if resourceGroup == "" {
				resourceGroup = ResourceGroupForPostgresServer(servers, selectedServer)
			}
		}
	}
	if resourceGroup == "" {
		return nil, errors.New("a resource group is required")
	}

	actionCtx, cancel := s.WithActionTimeout(ctx)
	var result models.AzurePostgresLifecycleResult
	var actionErr error
	switch action {
	case "start":
		result, actionErr = s.postgres.StartPostgresServer(actionCtx, profile, resourceGroup, serverName)
	case "stop":
		result, actionErr = s.postgres.StopPostgresServer(actionCtx, profile, resourceGroup, serverName)
	default:
		cancel()
		return nil, fmt.Errorf("unsupported postgres server action %q", action)
	}
	cancel()
	if actionErr != nil {
		return nil, actionErr
	}
	if s.invalidator != nil {
		s.invalidator.InvalidateResourceCache(ctx, "azure.postgres-servers", profile.ProfileID)
	}

	return s.FinishWriteAction(
		ctx, snapshot, notifier, sessionport.SnapshotOptions{AzureScope: "postgres"},
		result.Summary,
		func(session *models.SessionSnapshot) {
			session.SelectedAzurePostgresServer = serverName
		},
	)
}

// HandleFunctionsInvoke implements azure.functions.invoke.
func (s *Service) HandleFunctionsInvoke(ctx context.Context, params json.RawMessage, _ sessionport.Notifier) (any, error) {
	if s == nil || s.functions == nil {
		return nil, errors.New("azure write service is not available")
	}
	var request struct {
		AppName      string `json:"appName"`
		FunctionName string `json:"functionName"`
		Payload      string `json:"payload"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	appName := strings.TrimSpace(request.AppName)
	functionName := strings.TrimSpace(request.FunctionName)
	if appName == "" || functionName == "" {
		return nil, errors.New("a function app and function are required")
	}
	snapshot, err := s.discovery.Discover()
	if err != nil {
		return nil, err
	}
	_, profile, err := s.AuthorizeWrite(
		ctx, snapshot,
		"open a locked Azure workspace before invoking a function",
		"invoking a function requires write mode to be enabled for this Azure workspace",
	)
	if err != nil {
		return nil, err
	}

	listCtx, listCancel := s.WithActionTimeout(ctx)
	apps, _ := s.functions.ListFunctionApps(listCtx, profile)
	listCancel()
	resourceGroup := ResourceGroupForFunctionApp(apps, appName)

	actionCtx, cancel := s.WithActionTimeout(ctx)
	defer cancel()
	return s.functions.InvokeFunction(actionCtx, profile, resourceGroup, appName, functionName, request.Payload)
}

// HandleWebAppsInvokeAction implements azure.webApps.invokeAction.
func (s *Service) HandleWebAppsInvokeAction(ctx context.Context, params json.RawMessage, notifier sessionport.Notifier) (any, error) {
	if s == nil || s.webapps == nil {
		return nil, errors.New("azure write service is not available")
	}
	var request struct {
		Action  string `json:"action"`
		AppName string `json:"appName"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	action := strings.TrimSpace(request.Action)
	if action == "" {
		return nil, errors.New("web app action is required")
	}
	snapshot, err := s.discovery.Discover()
	if err != nil {
		return nil, err
	}
	session, profile, err := s.AuthorizeWrite(
		ctx, snapshot,
		"open an Azure workspace before invoking web app actions",
		"web app actions require write mode to be enabled for this Azure workspace",
	)
	if err != nil {
		return nil, err
	}
	_, resourceGroup, app, err := ActiveWebAppSelection(ctx, s.webapps, snapshot, session, request.AppName)
	if err != nil {
		return nil, err
	}
	slotName := strings.TrimSpace(session.SelectedAzureWebAppSlot)

	actionCtx, cancel := s.WithActionTimeout(ctx)
	err = s.webapps.InvokeWebAppAction(actionCtx, profile, resourceGroup, app.Name, action, slotName)
	cancel()
	if err != nil {
		return nil, err
	}

	return s.FinishWriteAction(
		ctx, snapshot, notifier, sessionport.SnapshotOptions{AzureScope: "webapps"},
		fmt.Sprintf("Invoked %s on web app %s.", action, app.Name),
		func(session *models.SessionSnapshot) {
			session.SelectedAzureResourceGroup = resourceGroup
			session.SelectedAzureWebAppName = app.Name
		},
	)
}

// HandleWebAppsSetSetting implements azure.webApps.setSetting.
func (s *Service) HandleWebAppsSetSetting(ctx context.Context, params json.RawMessage, notifier sessionport.Notifier) (any, error) {
	if s == nil || s.webapps == nil {
		return nil, errors.New("azure write service is not available")
	}
	var request struct {
		AppName     string `json:"appName"`
		Name        string `json:"name"`
		Value       string `json:"value"`
		SlotSetting bool   `json:"slotSetting"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	settingName := strings.TrimSpace(request.Name)
	if settingName == "" {
		return nil, errors.New("a setting name is required")
	}
	snapshot, err := s.discovery.Discover()
	if err != nil {
		return nil, err
	}
	session, profile, err := s.AuthorizeWrite(
		ctx, snapshot,
		"open an Azure workspace before invoking web app actions",
		"updating app settings requires write mode to be enabled for this Azure workspace",
	)
	if err != nil {
		return nil, err
	}
	_, resourceGroup, app, err := ActiveWebAppSelection(ctx, s.webapps, snapshot, session, request.AppName)
	if err != nil {
		return nil, err
	}
	slotName := strings.TrimSpace(session.SelectedAzureWebAppSlot)

	actionCtx, cancel := s.WithActionTimeout(ctx)
	err = s.webapps.SetWebAppSetting(actionCtx, profile, resourceGroup, app.Name, settingName, request.Value, request.SlotSetting, slotName)
	cancel()
	if err != nil {
		return nil, err
	}

	return s.FinishWriteAction(
		ctx, snapshot, notifier, sessionport.SnapshotOptions{AzureScope: "webapps"},
		fmt.Sprintf("Set application setting %s on web app %s.", settingName, app.Name),
		func(session *models.SessionSnapshot) {
			session.SelectedAzureResourceGroup = resourceGroup
			session.SelectedAzureWebAppName = app.Name
		},
	)
}

// HandleWebAppsDeleteSetting implements azure.webApps.deleteSetting.
func (s *Service) HandleWebAppsDeleteSetting(ctx context.Context, params json.RawMessage, notifier sessionport.Notifier) (any, error) {
	if s == nil || s.webapps == nil {
		return nil, errors.New("azure write service is not available")
	}
	var request struct {
		AppName string `json:"appName"`
		Name    string `json:"name"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	settingName := strings.TrimSpace(request.Name)
	if settingName == "" {
		return nil, errors.New("a setting name is required")
	}
	snapshot, err := s.discovery.Discover()
	if err != nil {
		return nil, err
	}
	session, profile, err := s.AuthorizeWrite(
		ctx, snapshot,
		"open an Azure workspace before invoking web app actions",
		"deleting app settings requires write mode to be enabled for this Azure workspace",
	)
	if err != nil {
		return nil, err
	}
	_, resourceGroup, app, err := ActiveWebAppSelection(ctx, s.webapps, snapshot, session, request.AppName)
	if err != nil {
		return nil, err
	}
	slotName := strings.TrimSpace(session.SelectedAzureWebAppSlot)

	actionCtx, cancel := s.WithActionTimeout(ctx)
	err = s.webapps.DeleteWebAppSetting(actionCtx, profile, resourceGroup, app.Name, settingName, slotName)
	cancel()
	if err != nil {
		return nil, err
	}

	return s.FinishWriteAction(
		ctx, snapshot, notifier, sessionport.SnapshotOptions{AzureScope: "webapps"},
		fmt.Sprintf("Deleted application setting %s from web app %s.", settingName, app.Name),
		func(session *models.SessionSnapshot) {
			session.SelectedAzureResourceGroup = resourceGroup
			session.SelectedAzureWebAppName = app.Name
		},
	)
}

// HandleWebAppsCreateSlot implements azure.webApps.createSlot.
func (s *Service) HandleWebAppsCreateSlot(ctx context.Context, params json.RawMessage, notifier sessionport.Notifier) (any, error) {
	if s == nil || s.webapps == nil {
		return nil, errors.New("azure write service is not available")
	}
	var request struct {
		AppName  string `json:"appName"`
		SlotName string `json:"slotName"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	slotName := strings.TrimSpace(request.SlotName)
	if slotName == "" {
		return nil, errors.New("a deployment slot name is required")
	}
	if strings.EqualFold(slotName, "production") {
		return nil, errors.New("production is not a valid deployment slot name")
	}
	snapshot, err := s.discovery.Discover()
	if err != nil {
		return nil, err
	}
	session, profile, err := s.AuthorizeWrite(
		ctx, snapshot,
		"open an Azure workspace before invoking web app actions",
		"deployment slot create requires write mode to be enabled for this Azure workspace",
	)
	if err != nil {
		return nil, err
	}
	_, resourceGroup, app, err := ActiveWebAppSelection(ctx, s.webapps, snapshot, session, request.AppName)
	if err != nil {
		return nil, err
	}

	actionCtx, cancel := s.WithActionTimeout(ctx)
	err = s.webapps.CreateWebAppDeploymentSlot(actionCtx, profile, resourceGroup, app.Name, slotName)
	cancel()
	if err != nil {
		return nil, err
	}

	return s.FinishWriteAction(
		ctx, snapshot, notifier, sessionport.SnapshotOptions{AzureScope: "webapps"},
		fmt.Sprintf("Created deployment slot %s on web app %s.", slotName, app.Name),
		func(session *models.SessionSnapshot) {
			session.SelectedAzureResourceGroup = resourceGroup
			session.SelectedAzureWebAppName = app.Name
			session.SelectedAzureWebAppSlot = slotName
		},
	)
}

// HandleWebAppsSwapSlots implements azure.webApps.swapSlots.
func (s *Service) HandleWebAppsSwapSlots(ctx context.Context, params json.RawMessage, notifier sessionport.Notifier) (any, error) {
	if s == nil || s.webapps == nil {
		return nil, errors.New("azure write service is not available")
	}
	var request struct {
		AppName  string `json:"appName"`
		SlotName string `json:"slotName"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	slotName := strings.TrimSpace(request.SlotName)
	if slotName == "" || strings.EqualFold(slotName, "production") {
		return nil, errors.New("select a non-production deployment slot before swapping")
	}
	snapshot, err := s.discovery.Discover()
	if err != nil {
		return nil, err
	}
	session, profile, err := s.AuthorizeWrite(
		ctx, snapshot,
		"open an Azure workspace before invoking web app actions",
		"deployment slot swap requires write mode to be enabled for this Azure workspace",
	)
	if err != nil {
		return nil, err
	}
	_, resourceGroup, app, err := ActiveWebAppSelection(ctx, s.webapps, snapshot, session, request.AppName)
	if err != nil {
		return nil, err
	}

	actionCtx, cancel := s.WithActionTimeout(ctx)
	err = s.webapps.SwapWebAppDeploymentSlots(actionCtx, profile, resourceGroup, app.Name, slotName)
	cancel()
	if err != nil {
		return nil, err
	}

	return s.FinishWriteAction(
		ctx, snapshot, notifier, sessionport.SnapshotOptions{AzureScope: "webapps"},
		fmt.Sprintf("Swapped production with deployment slot %s on web app %s.", slotName, app.Name),
		func(session *models.SessionSnapshot) {
			session.SelectedAzureResourceGroup = resourceGroup
			session.SelectedAzureWebAppName = app.Name
			session.SelectedAzureWebAppSlot = ""
		},
	)
}

// HandleWebAppsCreate implements azure.webApps.create.
func (s *Service) HandleWebAppsCreate(ctx context.Context, params json.RawMessage, notifier sessionport.Notifier) (any, error) {
	if s == nil || s.webapps == nil {
		return nil, errors.New("azure write service is not available")
	}
	var request struct {
		ResourceGroup    string `json:"resourceGroup"`
		AppName          string `json:"appName"`
		Location         string `json:"location"`
		Runtime          string `json:"runtime"`
		ExistingPlanName string `json:"existingPlanName"`
		NewPlanName      string `json:"newPlanName"`
		PlanSKU          string `json:"planSku"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	resourceGroup := strings.TrimSpace(request.ResourceGroup)
	appName := strings.TrimSpace(request.AppName)
	if resourceGroup == "" || appName == "" {
		return nil, errors.New("resource group and app name are required")
	}
	snapshot, err := s.discovery.Discover()
	if err != nil {
		return nil, err
	}
	_, profile, err := s.AuthorizeWrite(
		ctx, snapshot,
		"open a locked Azure workspace before creating a web app",
		"web app create requires write mode to be enabled for this Azure workspace",
	)
	if err != nil {
		return nil, err
	}

	actionCtx, cancel := s.WithActionTimeout(ctx)
	created, err := s.webapps.CreateWebApp(
		actionCtx,
		profile,
		resourceGroup,
		appName,
		request.Location,
		request.Runtime,
		request.ExistingPlanName,
		request.NewPlanName,
		request.PlanSKU,
	)
	cancel()
	if err != nil {
		return nil, err
	}

	return s.FinishWriteAction(
		ctx, snapshot, notifier, sessionport.SnapshotOptions{AzureScope: "webapps"},
		fmt.Sprintf("Created App Service web app %s.", created.Name),
		func(session *models.SessionSnapshot) {
			session.SelectedAzureResourceGroup = resourceGroup
			session.SelectedAzureWebAppName = created.Name
		},
	)
}

// HandleWafConfigSetMode implements azure.waf.config.setMode.
func (s *Service) HandleWafConfigSetMode(ctx context.Context, params json.RawMessage, notifier sessionport.Notifier) (any, error) {
	if s == nil || s.waf == nil {
		return nil, errors.New("azure write service is not available")
	}
	var request struct {
		ResourceGroup string `json:"resourceGroup"`
		PolicyName    string `json:"policyName"`
		Mode          string `json:"mode"`
		Confirm       bool   `json:"confirm"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	if !request.Confirm {
		return nil, errors.New("confirm the policy mode change before applying it")
	}
	mode, err := NormaliseWafPolicyMode(request.Mode)
	if err != nil {
		return nil, err
	}
	snapshot, err := s.discovery.Discover()
	if err != nil {
		return nil, err
	}
	_, profile, err := s.AuthorizeWrite(
		ctx, snapshot,
		"open a locked Azure workspace first",
		"enable Azure write mode before applying WAF changes",
	)
	if err != nil {
		return nil, err
	}

	actionCtx, cancel := s.WithActionTimeout(ctx)
	err = s.waf.UpdateWafPolicyMode(actionCtx, profile, request.ResourceGroup, request.PolicyName, mode)
	cancel()
	if err != nil {
		return nil, err
	}

	return s.FinishWriteAction(
		ctx, snapshot, notifier, sessionport.SnapshotOptions{AzureScope: "waf"},
		fmt.Sprintf("Updated WAF policy %s mode to %s.", request.PolicyName, mode),
		nil,
	)
}

// HandleWafConfigSetManagedRule implements azure.waf.config.setManagedRule.
func (s *Service) HandleWafConfigSetManagedRule(ctx context.Context, params json.RawMessage, notifier sessionport.Notifier) (any, error) {
	if s == nil || s.waf == nil {
		return nil, errors.New("azure write service is not available")
	}
	var request struct {
		ResourceGroup  string `json:"resourceGroup"`
		PolicyName     string `json:"policyName"`
		RuleSetType    string `json:"ruleSetType"`
		RuleSetVersion string `json:"ruleSetVersion"`
		RuleGroupName  string `json:"ruleGroupName"`
		RuleID         string `json:"ruleId"`
		Enabled        bool   `json:"enabled"`
		Confirm        bool   `json:"confirm"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	if !request.Confirm {
		return nil, errors.New("confirm the managed rule change before applying it")
	}
	snapshot, err := s.discovery.Discover()
	if err != nil {
		return nil, err
	}
	_, profile, err := s.AuthorizeWrite(
		ctx, snapshot,
		"open a locked Azure workspace first",
		"enable Azure write mode before applying WAF changes",
	)
	if err != nil {
		return nil, err
	}

	actionCtx, cancel := s.WithActionTimeout(ctx)
	err = s.waf.SetWafManagedRuleOverride(
		actionCtx, profile, request.ResourceGroup, request.PolicyName,
		request.RuleSetType, request.RuleSetVersion, request.RuleGroupName, request.RuleID, request.Enabled,
	)
	cancel()
	if err != nil {
		return nil, err
	}
	state := "disabled"
	if request.Enabled {
		state = "enabled"
	}

	return s.FinishWriteAction(
		ctx, snapshot, notifier, sessionport.SnapshotOptions{AzureScope: "waf"},
		fmt.Sprintf("%s managed rule %s on policy %s.", state, request.RuleID, request.PolicyName),
		nil,
	)
}

// HandleWafConfigAddExclusion implements azure.waf.config.addExclusion.
func (s *Service) HandleWafConfigAddExclusion(ctx context.Context, params json.RawMessage, notifier sessionport.Notifier) (any, error) {
	return s.handleWafConfigExclusionChange(ctx, params, notifier, true)
}

// HandleWafConfigRemoveExclusion implements azure.waf.config.removeExclusion.
func (s *Service) HandleWafConfigRemoveExclusion(ctx context.Context, params json.RawMessage, notifier sessionport.Notifier) (any, error) {
	return s.handleWafConfigExclusionChange(ctx, params, notifier, false)
}

func (s *Service) handleWafConfigExclusionChange(
	ctx context.Context,
	params json.RawMessage,
	notifier sessionport.Notifier,
	add bool,
) (any, error) {
	if s == nil || s.waf == nil {
		return nil, errors.New("azure write service is not available")
	}
	var request struct {
		ResourceGroup string                   `json:"resourceGroup"`
		PolicyName    string                   `json:"policyName"`
		Exclusion     models.AzureWafExclusion `json:"exclusion"`
		Confirm       bool                     `json:"confirm"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	if !request.Confirm {
		return nil, errors.New("confirm the exclusion change before applying it")
	}
	snapshot, err := s.discovery.Discover()
	if err != nil {
		return nil, err
	}
	_, profile, err := s.AuthorizeWrite(
		ctx, snapshot,
		"open a locked Azure workspace first",
		"enable Azure write mode before applying WAF changes",
	)
	if err != nil {
		return nil, err
	}

	actionCtx, cancel := s.WithActionTimeout(ctx)
	var changeErr error
	verb := "Added"
	if add {
		changeErr = s.waf.AddWafExclusion(actionCtx, profile, request.ResourceGroup, request.PolicyName, request.Exclusion)
	} else {
		verb = "Removed"
		changeErr = s.waf.RemoveWafExclusion(actionCtx, profile, request.ResourceGroup, request.PolicyName, request.Exclusion)
	}
	cancel()
	if changeErr != nil {
		return nil, changeErr
	}

	return s.FinishWriteAction(
		ctx, snapshot, notifier, sessionport.SnapshotOptions{AzureScope: "waf"},
		fmt.Sprintf("%s exclusion on policy %s.", verb, request.PolicyName),
		nil,
	)
}

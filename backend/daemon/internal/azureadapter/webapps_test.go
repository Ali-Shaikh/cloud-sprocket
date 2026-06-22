// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package azureadapter

import (
	"context"
	"strings"
	"testing"

	"cloudsprocket/backend/daemon/internal/config"
)

func TestGetWebAppDecodesDetailFields(t *testing.T) {
	showOut := []byte(`{
		"name":"mkt-portal",
		"resourceGroup":"rg-prod",
		"location":"westeurope",
		"state":"Running",
		"defaultHostName":"mkt-portal.azurewebsites.net",
		"kind":"app,linux",
		"httpsOnly":true,
		"outboundIpAddresses":"20.0.0.1",
		"serverFarmId":"/subscriptions/sub/resourceGroups/rg-prod/providers/Microsoft.Web/serverfarms/mkt-plan",
		"identity":{"type":"SystemAssigned","principalId":"principal-1"},
		"siteConfig":{"linuxFxVersion":"NODE|22-lts"}
	}`)
	fake := &fakeCLI{out: showOut}
	inv := NewInventory(config.Settings{})
	inv.runner = fake

	app, err := inv.GetWebApp(context.Background(), cloudAzureProfile(), "rg-prod", "mkt-portal")
	if err != nil {
		t.Fatalf("GetWebApp: %v", err)
	}
	if app.AppServicePlan != "mkt-plan" {
		t.Fatalf("plan = %q, want mkt-plan", app.AppServicePlan)
	}
	if app.Runtime != "NODE|22-lts" {
		t.Fatalf("runtime = %q", app.Runtime)
	}
	if app.IdentityType != "SystemAssigned" || app.IdentityPrincipalID != "principal-1" {
		t.Fatalf("identity = %+v", app)
	}
	expectCLIArgsContain(t, fake.args, "webapp", "show", "--resource-group", "rg-prod", "--name", "mkt-portal")
}

func TestListAppServicePlansDecodesSKU(t *testing.T) {
	listOut := []byte(`[{
		"name":"mkt-plan",
		"resourceGroup":"rg-prod",
		"location":"westeurope",
		"kind":"linux",
		"status":"Ready",
		"numberOfWorkers":2,
		"sku":{"name":"P1v3","tier":"PremiumV3"}
	}]`)
	fake := &fakeCLI{out: listOut}
	inv := NewInventory(config.Settings{})
	inv.runner = fake

	plans, err := inv.ListAppServicePlans(context.Background(), cloudAzureProfile(), "rg-prod")
	if err != nil {
		t.Fatalf("ListAppServicePlans: %v", err)
	}
	if len(plans) != 1 || plans[0].SKU != "P1v3 (PremiumV3)" {
		t.Fatalf("plans = %+v", plans)
	}
}

func TestListWebAppSettingsSortsByName(t *testing.T) {
	listOut := []byte(`[
		{"name":"ZETA","value":"z","slotSetting":false},
		{"name":"ALPHA","value":"a","slotSetting":true}
	]`)
	fake := &fakeCLI{out: listOut}
	inv := NewInventory(config.Settings{})
	inv.runner = fake

	settings, err := inv.ListWebAppSettings(context.Background(), cloudAzureProfile(), "rg-prod", "mkt-portal")
	if err != nil {
		t.Fatalf("ListWebAppSettings: %v", err)
	}
	if len(settings) != 2 || settings[0].Name != "ALPHA" || !settings[0].SlotSetting || settings[1].Name != "ZETA" {
		t.Fatalf("settings = %+v", settings)
	}
}

func TestInvokeWebAppActionBuildsExpectedArgs(t *testing.T) {
	fake := &fakeCLI{}
	inv := NewInventory(config.Settings{})
	inv.runner = fake

	if err := inv.InvokeWebAppAction(context.Background(), cloudAzureProfile(), "rg-prod", "mkt-portal", "restart"); err != nil {
		t.Fatalf("InvokeWebAppAction: %v", err)
	}
	expectCLIArgsContain(t, fake.args, "webapp", "restart", "--resource-group", "rg-prod", "--name", "mkt-portal")
}

func TestInvokeWebAppActionRejectsUnknownAction(t *testing.T) {
	inv := NewInventory(config.Settings{})
	err := inv.InvokeWebAppAction(context.Background(), cloudAzureProfile(), "rg-prod", "mkt-portal", "scale")
	if err == nil || !strings.Contains(err.Error(), "unsupported web app action") {
		t.Fatalf("expected unsupported action error, got %v", err)
	}
}

func TestPlanNameFromServerFarmID(t *testing.T) {
	got := planNameFromServerFarmID(
		"/subscriptions/sub/resourceGroups/rg/providers/Microsoft.Web/serverfarms/my-plan",
	)
	if got != "my-plan" {
		t.Fatalf("planNameFromServerFarmID = %q", got)
	}
}

func TestListWebAppsLocalFlociRejected(t *testing.T) {
	inv := NewInventory(config.Settings{})
	if _, err := inv.ListWebApps(context.Background(), localFlociProfile(), "rg-prod"); err == nil {
		t.Fatal("expected local floci rejection")
	}
}
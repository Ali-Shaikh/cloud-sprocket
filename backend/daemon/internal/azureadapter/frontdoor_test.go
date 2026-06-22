// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package azureadapter

import (
	"context"
	"strings"
	"testing"

	"cloudsprocket/backend/daemon/internal/config"
)

func TestListFrontDoorProfilesFiltersNonAfdSkus(t *testing.T) {
	fake := &fakeCLI{
		out: []byte(`[
			{"name":"afd-prod","resourceGroup":"rg-net","location":"Global","sku":{"name":"Standard_AzureFrontDoor"}},
			{"name":"cdn-only","resourceGroup":"rg-net","location":"Global","sku":{"name":"Standard_Microsoft"}}
		]`),
	}
	inv := NewInventory(config.Settings{})
	inv.runner = fake

	profiles, err := inv.ListFrontDoorProfiles(context.Background(), cloudAzureProfile(), false)
	if err != nil {
		t.Fatalf("ListFrontDoorProfiles: %v", err)
	}
	if len(profiles) != 1 || profiles[0].Name != "afd-prod" {
		t.Fatalf("unexpected profiles: %+v", profiles)
	}
	if !strings.Contains(strings.Join(fake.args, " "), "afd profile list") {
		t.Fatalf("expected profile list call, got %q", fake.args)
	}
}

type frontDoorRecordingCLI struct {
	profileList   []byte
	securityList  []byte
}

func (f *frontDoorRecordingCLI) CommandContext(_ context.Context, _ string, args ...string) ([]byte, error) {
	joined := strings.Join(args, " ")
	if strings.Contains(joined, "security-policy list") {
		return f.securityList, nil
	}
	return f.profileList, nil
}

func TestListFrontDoorProfilesLinksWafPolicy(t *testing.T) {
	fake := &frontDoorRecordingCLI{
		profileList: []byte(`[
			{"name":"afd-prod","resourceGroup":"rg-net","location":"Global","sku":{"name":"Premium_AzureFrontDoor"}}
		]`),
		securityList: []byte(`[
			{
				"properties":{
					"parameters":{
						"wafPolicy":{
							"id":"/subscriptions/sub/resourceGroups/rg-waf/providers/Microsoft.Network/frontdoorWebApplicationFirewallPolicies/portal-waf"
						}
					}
				}
			}
		]`),
	}
	inv := NewInventory(config.Settings{})
	inv.runner = fake

	profiles, err := inv.ListFrontDoorProfiles(context.Background(), cloudAzureProfile(), true)
	if err != nil {
		t.Fatalf("ListFrontDoorProfiles: %v", err)
	}
	if len(profiles) != 1 {
		t.Fatalf("profiles = %+v", profiles)
	}
	if profiles[0].WafPolicyName != "portal-waf" || profiles[0].WafPolicyResourceGroup != "rg-waf" {
		t.Fatalf("expected WAF link, got %+v", profiles[0])
	}
}

func TestWafPolicyIdentityFromARMID(t *testing.T) {
	id := "/subscriptions/111/resourceGroups/rg-waf/providers/Microsoft.Cdn/cdnWebApplicationFirewallPolicies/shared-waf"
	name, rg := wafPolicyIdentityFromARMID(id)
	if name != "shared-waf" || rg != "rg-waf" {
		t.Fatalf("identity = (%q, %q)", name, rg)
	}
}

func TestListFrontDoorEndpointsDecodesHostName(t *testing.T) {
	fake := &fakeCLI{
		out: []byte(`[
			{"name":"api","properties":{"hostName":"api-afd.azureedge.net","enabledState":"Enabled"}}
		]`),
	}
	inv := NewInventory(config.Settings{})
	inv.runner = fake

	endpoints, err := inv.ListFrontDoorEndpoints(context.Background(), cloudAzureProfile(), "rg-net", "afd-prod")
	if err != nil {
		t.Fatalf("ListFrontDoorEndpoints: %v", err)
	}
	if len(endpoints) != 1 || endpoints[0].HostName != "api-afd.azureedge.net" {
		t.Fatalf("unexpected endpoints: %+v", endpoints)
	}
}

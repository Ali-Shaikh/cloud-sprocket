// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package azureadapter

import (
	"context"
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/Azure/azure-sdk-for-go/sdk/azcore"
	"github.com/Azure/azure-sdk-for-go/sdk/azcore/arm"
	"github.com/Azure/azure-sdk-for-go/sdk/azcore/cloud"
	"github.com/Azure/azure-sdk-for-go/sdk/azcore/policy"
	"github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/compute/armcompute/v6"
	"github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/resources/armresources/v3"

	"cloudsprocket/backend/daemon/internal/flociazcompat"
	"cloudsprocket/backend/daemon/internal/models"
)

const (
	// localTenantMarker is the tenantId the daemon writes for the local floci-az
	// subscription (see app.writeLocalAzureSubscription). It is the marker that
	// distinguishes the local profile from a real Azure subscription.
	localTenantMarker = "cloudsprocket-local"
)

// flociStaticCredential is a no-op TokenCredential for the local floci-az
// emulator. floci-az does not validate bearer tokens, so we attach a fixed
// token instead of running the MSAL client-credentials flow. This also sidesteps
// azidentity's refusal to use a non-HTTPS authority host (floci's login endpoint
// is plain HTTP); the ARM clients still need InsecureAllowCredentialWithHTTP to
// send the token over HTTP.
type flociStaticCredential struct{}

func (flociStaticCredential) GetToken(context.Context, policy.TokenRequestOptions) (azcore.AccessToken, error) {
	return azcore.AccessToken{Token: "floci-az-local", ExpiresOn: time.Now().Add(time.Hour)}, nil
}

// isLocalFlociProfile reports whether the profile targets the local floci-az
// emulator rather than real Azure. It keys off the synthetic tenant marker the
// daemon writes, not the subscription id, so renaming the local profile does
// not break detection.
func isLocalFlociProfile(profile models.ProfileSummary) bool {
	for _, field := range profile.Attributes {
		if field.Label == "Tenant ID" && strings.EqualFold(strings.TrimSpace(field.Value), localTenantMarker) {
			return true
		}
	}
	return false
}

func (i *Inventory) flociEndpoint() string {
	endpoint := strings.TrimRight(strings.TrimSpace(i.localEndpoint), "/")
	if endpoint == "" {
		endpoint = flociazcompat.DefaultEndpoint
	}
	return endpoint
}

func (i *Inventory) flociCloudConfig() cloud.Configuration {
	endpoint := i.flociEndpoint()
	audience := endpoint + "/"
	return cloud.Configuration{
		ActiveDirectoryAuthorityHost: audience,
		Services: map[cloud.ServiceName]cloud.ServiceConfiguration{
			cloud.ResourceManager: {Endpoint: endpoint, Audience: audience},
		},
	}
}

// defaultLocalCredential returns the no-op credential used against floci-az.
func (i *Inventory) defaultLocalCredential(cloud.Configuration) (azcore.TokenCredential, error) {
	return flociStaticCredential{}, nil
}

func (i *Inventory) flociArmOptions(cfg cloud.Configuration) *arm.ClientOptions {
	return &arm.ClientOptions{
		ClientOptions: policy.ClientOptions{
			Cloud:                           cfg,
			InsecureAllowCredentialWithHTTP: true,
		},
		DisableRPRegistration: true,
	}
}

func (i *Inventory) listLocalResourceGroups(ctx context.Context) ([]models.AzureResourceGroup, error) {
	cfg := i.flociCloudConfig()
	credential, err := i.newLocalCredential(cfg)
	if err != nil {
		return nil, fmt.Errorf("floci-az credential: %w", err)
	}
	client, err := armresources.NewResourceGroupsClient(i.localSubscriptionID, credential, i.flociArmOptions(cfg))
	if err != nil {
		return nil, fmt.Errorf("floci-az resource groups client: %w", err)
	}

	groups := make([]models.AzureResourceGroup, 0)
	pager := client.NewListPager(nil)
	for pager.More() {
		page, err := pager.NextPage(ctx)
		if err != nil {
			return nil, fmt.Errorf("list floci-az resource groups: %w", err)
		}
		for _, group := range page.Value {
			if group == nil {
				continue
			}
			provisioningState := ""
			if group.Properties != nil {
				provisioningState = derefString(group.Properties.ProvisioningState)
			}
			groups = append(groups, models.AzureResourceGroup{
				Name:              derefString(group.Name),
				Location:          derefString(group.Location),
				ProvisioningState: provisioningState,
				ManagedBy:         derefString(group.ManagedBy),
				Tags:              detailFieldsFromPtrTags(group.Tags),
			})
		}
	}
	sort.Slice(groups, func(left int, right int) bool {
		return strings.ToLower(groups[left].Name) < strings.ToLower(groups[right].Name)
	})
	return groups, nil
}

func (i *Inventory) listLocalVirtualMachines(ctx context.Context, resourceGroup string) ([]models.AzureVirtualMachine, error) {
	cfg := i.flociCloudConfig()
	credential, err := i.newLocalCredential(cfg)
	if err != nil {
		return nil, fmt.Errorf("floci-az credential: %w", err)
	}
	client, err := armcompute.NewVirtualMachinesClient(i.localSubscriptionID, credential, i.flociArmOptions(cfg))
	if err != nil {
		return nil, fmt.Errorf("floci-az virtual machines client: %w", err)
	}

	vms := make([]models.AzureVirtualMachine, 0)
	pager := client.NewListPager(resourceGroup, nil)
	for pager.More() {
		page, err := pager.NextPage(ctx)
		if err != nil {
			return nil, fmt.Errorf("list floci-az virtual machines: %w", err)
		}
		for _, vm := range page.Value {
			if vm == nil {
				continue
			}
			size := ""
			osType := ""
			provisioningState := ""
			vmID := ""
			if props := vm.Properties; props != nil {
				if props.HardwareProfile != nil && props.HardwareProfile.VMSize != nil {
					size = string(*props.HardwareProfile.VMSize)
				}
				if props.StorageProfile != nil && props.StorageProfile.OSDisk != nil && props.StorageProfile.OSDisk.OSType != nil {
					osType = string(*props.StorageProfile.OSDisk.OSType)
				}
				provisioningState = derefString(props.ProvisioningState)
				vmID = derefString(props.VMID)
			}
			vms = append(vms, models.AzureVirtualMachine{
				VMID:              vmID,
				Name:              derefString(vm.Name),
				ResourceGroup:     resourceGroup,
				Location:          derefString(vm.Location),
				ProvisioningState: provisioningState,
				Size:              size,
				OSType:            osType,
				Tags:              detailFieldsFromPtrTags(vm.Tags),
			})
		}
	}
	sort.Slice(vms, func(left int, right int) bool {
		return strings.ToLower(vms[left].Name) < strings.ToLower(vms[right].Name)
	})
	return vms, nil
}

func derefString(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}

func detailFieldsFromPtrTags(tags map[string]*string) []models.DetailField {
	if len(tags) == 0 {
		return nil
	}
	flat := make(map[string]string, len(tags))
	for key, value := range tags {
		flat[key] = derefString(value)
	}
	return detailFieldsFromTags(flat)
}

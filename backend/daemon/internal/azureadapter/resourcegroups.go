package azureadapter

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/resources/armresources/v3"

	"cloudsprocket/backend/daemon/internal/models"
)

func (i *Inventory) CreateResourceGroup(
	ctx context.Context,
	profile models.ProfileSummary,
	name string,
	location string,
) (models.AzureResourceGroup, error) {
	name = strings.TrimSpace(name)
	location = strings.TrimSpace(location)
	if name == "" {
		return models.AzureResourceGroup{}, fmt.Errorf("resource group name is required")
	}
	if location == "" {
		location = "westeurope"
	}
	if isLocalFlociProfile(profile) {
		return i.createLocalResourceGroup(ctx, name, location)
	}
	args := []string{
		"group", "create",
		"--subscription", profile.ProfileID,
		"--name", name,
		"--location", location,
		"--output", "json",
		"--only-show-errors",
	}
	payload, err := i.run(ctx, args...)
	if err != nil {
		return models.AzureResourceGroup{}, err
	}
	var decoded struct {
		Name       string `json:"name"`
		Location   string `json:"location"`
		Properties struct {
			ProvisioningState string `json:"provisioningState"`
		} `json:"properties"`
	}
	if err := json.Unmarshal(payload, &decoded); err != nil {
		return models.AzureResourceGroup{}, fmt.Errorf("decode azure resource group create: %w", err)
	}
	return models.AzureResourceGroup{
		Name:              decoded.Name,
		Location:          decoded.Location,
		ProvisioningState: decoded.Properties.ProvisioningState,
	}, nil
}

func (i *Inventory) DeleteResourceGroup(ctx context.Context, profile models.ProfileSummary, name string) error {
	name = strings.TrimSpace(name)
	if name == "" {
		return fmt.Errorf("resource group name is required")
	}
	if isLocalFlociProfile(profile) {
		return i.deleteLocalResourceGroup(ctx, name)
	}
	args := []string{
		"group", "delete",
		"--subscription", profile.ProfileID,
		"--name", name,
		"--yes",
		"--no-wait",
		"--only-show-errors",
	}
	_, err := i.run(ctx, args...)
	return err
}

func (i *Inventory) createLocalResourceGroup(
	ctx context.Context,
	name string,
	location string,
) (models.AzureResourceGroup, error) {
	cfg := i.flociCloudConfig()
	credential, err := i.newLocalCredential(cfg)
	if err != nil {
		return models.AzureResourceGroup{}, fmt.Errorf("floci-az credential: %w", err)
	}
	client, err := armresources.NewResourceGroupsClient(i.localSubscriptionID, credential, i.flociArmOptions(cfg))
	if err != nil {
		return models.AzureResourceGroup{}, fmt.Errorf("floci-az resource groups client: %w", err)
	}
	response, err := client.CreateOrUpdate(ctx, name, armresources.ResourceGroup{
		Location: &location,
	}, nil)
	if err != nil {
		return models.AzureResourceGroup{}, fmt.Errorf("create floci-az resource group: %w", err)
	}
	provisioningState := ""
	if response.Properties != nil {
		provisioningState = derefString(response.Properties.ProvisioningState)
	}
	return models.AzureResourceGroup{
		Name:              derefString(response.Name),
		Location:          derefString(response.Location),
		ProvisioningState: provisioningState,
	}, nil
}

func (i *Inventory) deleteLocalResourceGroup(ctx context.Context, name string) error {
	cfg := i.flociCloudConfig()
	credential, err := i.newLocalCredential(cfg)
	if err != nil {
		return fmt.Errorf("floci-az credential: %w", err)
	}
	client, err := armresources.NewResourceGroupsClient(i.localSubscriptionID, credential, i.flociArmOptions(cfg))
	if err != nil {
		return fmt.Errorf("floci-az resource groups client: %w", err)
	}
	poller, err := client.BeginDelete(ctx, name, nil)
	if err != nil {
		return fmt.Errorf("delete floci-az resource group: %w", err)
	}
	_, err = poller.PollUntilDone(ctx, nil)
	if err != nil {
		return fmt.Errorf("delete floci-az resource group: %w", err)
	}
	return nil
}
package azureadapter

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/storage/armstorage"

	"cloudsprocket/backend/daemon/internal/models"
)

func (i *Inventory) CreateStorageAccount(
	ctx context.Context,
	profile models.ProfileSummary,
	resourceGroup string,
	accountName string,
	location string,
) (models.AzureStorageAccount, error) {
	resourceGroup = strings.TrimSpace(resourceGroup)
	accountName = strings.ToLower(strings.TrimSpace(accountName))
	location = strings.TrimSpace(location)
	if resourceGroup == "" || accountName == "" {
		return models.AzureStorageAccount{}, fmt.Errorf("resource group and storage account name are required")
	}
	if err := validateStorageAccountName(accountName); err != nil {
		return models.AzureStorageAccount{}, err
	}
	if location == "" {
		location = "westeurope"
	}
	if isLocalFlociProfile(profile) {
		return i.createLocalStorageAccount(ctx, resourceGroup, accountName, location)
	}
	args := []string{
		"storage", "account", "create",
		"--subscription", profile.ProfileID,
		"--resource-group", resourceGroup,
		"--name", accountName,
		"--location", location,
		"--sku", "Standard_LRS",
		"--kind", "StorageV2",
		"--output", "json",
		"--only-show-errors",
	}
	payload, err := i.run(ctx, args...)
	if err != nil {
		return models.AzureStorageAccount{}, err
	}
	var decoded struct {
		Name     string `json:"name"`
		Kind     string `json:"kind"`
		Location string `json:"location"`
		PrimaryEndpoints struct {
			Blob string `json:"blob"`
		} `json:"primaryEndpoints"`
	}
	if err := json.Unmarshal(payload, &decoded); err != nil {
		return models.AzureStorageAccount{}, fmt.Errorf("decode azure storage account create: %w", err)
	}
	return models.AzureStorageAccount{
		Name:         decoded.Name,
		Kind:         decoded.Kind,
		Location:     decoded.Location,
		BlobEndpoint: decoded.PrimaryEndpoints.Blob,
	}, nil
}

func validateStorageAccountName(name string) error {
	if len(name) < 3 || len(name) > 24 {
		return fmt.Errorf("storage account name must be 3 to 24 characters")
	}
	for _, r := range name {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') {
			continue
		}
		return fmt.Errorf("storage account name may only contain lowercase letters and numbers")
	}
	return nil
}

func (i *Inventory) listLocalStorageAccounts(ctx context.Context) ([]models.AzureStorageAccount, error) {
	cfg := i.flociCloudConfig()
	credential, err := i.newLocalCredential(cfg)
	if err != nil {
		return nil, fmt.Errorf("floci-az credential: %w", err)
	}
	client, err := armstorage.NewAccountsClient(i.localSubscriptionID, credential, i.flociArmOptions(cfg))
	if err != nil {
		return nil, fmt.Errorf("floci-az storage accounts client: %w", err)
	}
	endpoint := i.flociEndpoint()
	accounts := make([]models.AzureStorageAccount, 0)
	seen := map[string]struct{}{}
	pager := client.NewListPager(nil)
	for pager.More() {
		page, err := pager.NextPage(ctx)
		if err != nil {
			return nil, fmt.Errorf("list floci-az storage accounts: %w", err)
		}
		for _, account := range page.Value {
			if account == nil {
				continue
			}
			name := derefString(account.Name)
			if name == "" {
				continue
			}
			seen[name] = struct{}{}
			accounts = append(accounts, mapStorageAccount(name, account, endpoint))
		}
	}
	if _, ok := seen[flociDevAccountName]; !ok {
		accounts = append(accounts, models.AzureStorageAccount{
			Name:         flociDevAccountName,
			Kind:         "StorageV2",
			Location:     "local",
			BlobEndpoint: endpoint + "/" + flociDevAccountName,
			Summary:      "floci-az built-in development storage account",
		})
	}
	return accounts, nil
}

func mapStorageAccount(name string, account *armstorage.Account, flociEndpoint string) models.AzureStorageAccount {
	entry := models.AzureStorageAccount{
		Name:     name,
		Kind:     string(derefSKUName(account.Kind)),
		Location: derefString(account.Location),
	}
	if account.Properties != nil && account.Properties.PrimaryEndpoints != nil {
		if blob := derefString(account.Properties.PrimaryEndpoints.Blob); blob != "" {
			entry.BlobEndpoint = blob
		}
	}
	if entry.BlobEndpoint == "" {
		entry.BlobEndpoint = flociEndpoint + "/" + name
	}
	return entry
}

func derefSKUName(kind *armstorage.Kind) armstorage.Kind {
	if kind == nil {
		return ""
	}
	return *kind
}

func (i *Inventory) createLocalStorageAccount(
	ctx context.Context,
	resourceGroup string,
	accountName string,
	location string,
) (models.AzureStorageAccount, error) {
	cfg := i.flociCloudConfig()
	credential, err := i.newLocalCredential(cfg)
	if err != nil {
		return models.AzureStorageAccount{}, fmt.Errorf("floci-az credential: %w", err)
	}
	client, err := armstorage.NewAccountsClient(i.localSubscriptionID, credential, i.flociArmOptions(cfg))
	if err != nil {
		return models.AzureStorageAccount{}, fmt.Errorf("floci-az storage accounts client: %w", err)
	}
	skuName := armstorage.SKUNameStandardLRS
	kind := armstorage.KindStorageV2
	poller, err := client.BeginCreate(ctx, resourceGroup, accountName, armstorage.AccountCreateParameters{
		Location: &location,
		Kind:     &kind,
		SKU: &armstorage.SKU{
			Name: &skuName,
		},
	}, nil)
	if err != nil {
		return models.AzureStorageAccount{}, fmt.Errorf("create floci-az storage account: %w", err)
	}
	response, err := poller.PollUntilDone(ctx, nil)
	if err != nil {
		return models.AzureStorageAccount{}, fmt.Errorf("create floci-az storage account: %w", err)
	}
	return mapStorageAccount(accountName, &response.Account, i.flociEndpoint()), nil
}

func (i *Inventory) storageAccountKey(
	ctx context.Context,
	profile models.ProfileSummary,
	accountName string,
) (string, error) {
	if isLocalFlociProfile(profile) {
		if accountName == flociDevAccountName {
			return flociDevAccountKey, nil
		}
		cfg := i.flociCloudConfig()
		credential, err := i.newLocalCredential(cfg)
		if err != nil {
			return "", err
		}
		client, err := armstorage.NewAccountsClient(i.localSubscriptionID, credential, i.flociArmOptions(cfg))
		if err != nil {
			return "", err
		}
		resourceGroup, err := i.findStorageAccountResourceGroup(ctx, client, accountName)
		if err != nil {
			return "", err
		}
		keys, err := client.ListKeys(ctx, resourceGroup, accountName, nil)
		if err != nil {
			return "", fmt.Errorf("list floci-az storage account keys: %w", err)
		}
		if keys.Keys == nil || len(keys.Keys) == 0 || keys.Keys[0].Value == nil {
			return "", fmt.Errorf("no storage account key returned for %s", accountName)
		}
		return *keys.Keys[0].Value, nil
	}
	args := []string{
		"storage", "account", "keys", "list",
		"--subscription", profile.ProfileID,
		"--account-name", accountName,
		"--query", "[0].value",
		"--output", "tsv",
		"--only-show-errors",
	}
	keyBytes, err := i.run(ctx, args...)
	if err != nil {
		return "", err
	}
	key := strings.TrimSpace(string(keyBytes))
	if key == "" {
		return "", fmt.Errorf("no storage account key returned for %s", accountName)
	}
	return key, nil
}

func (i *Inventory) findStorageAccountResourceGroup(
	ctx context.Context,
	client *armstorage.AccountsClient,
	accountName string,
) (string, error) {
	pager := client.NewListPager(nil)
	for pager.More() {
		page, err := pager.NextPage(ctx)
		if err != nil {
			return "", err
		}
		for _, account := range page.Value {
			if account == nil || account.Name == nil || *account.Name != accountName {
				continue
			}
			if account.ID == nil {
				break
			}
			parts := strings.Split(strings.Trim(*account.ID, "/"), "/")
			for index := 0; index < len(parts)-1; index++ {
				if strings.EqualFold(parts[index], "resourceGroups") && index+1 < len(parts) {
					return parts[index+1], nil
				}
			}
		}
	}
	return "", fmt.Errorf("storage account %s was not found in the subscription inventory", accountName)
}
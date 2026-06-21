// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package azureadapter

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"sort"
	"strconv"
	"strings"
	"time"

	"cloudsprocket/backend/daemon/internal/models"
)

// wellKnownCosmosKey is the public Cosmos DB emulator key. floci-az accepts any
// key in dev mode; we still sign requests properly so the same path works on real
// Azure with a real key.
const wellKnownCosmosKey = "C2y6yDjf5/R+ob0N8A7Cgv30VRDJIWEHLM+4QDU5DE2nQ9nDuVTqobD4b8mGGyPMbIZnqyMsEcaGQy67XIw/Jw=="

const cosmosVersion = "2018-12-31"
const cosmosSampleLimit = 20

// ListCosmosAccounts returns the Cosmos accounts. floci-az exposes a single local
// account (devstoreaccount1); cloud uses the az CLI.
func (i *Inventory) ListCosmosAccounts(
	ctx context.Context,
	profile models.ProfileSummary,
) ([]models.AzureCosmosAccount, error) {
	if isLocalFlociProfile(profile) {
		return []models.AzureCosmosAccount{{
			Name:             "devstoreaccount1",
			DocumentEndpoint: i.flociBaseURL() + "/devstoreaccount1-cosmos",
		}}, nil
	}
	payload, err := i.run(ctx,
		"cosmosdb", "list",
		"--subscription", profile.ProfileID,
		"--output", "json",
		"--only-show-errors",
	)
	if err != nil {
		return nil, err
	}
	var decoded []struct {
		Name             string `json:"name"`
		ResourceGroup    string `json:"resourceGroup"`
		DocumentEndpoint string `json:"documentEndpoint"`
	}
	if err := json.Unmarshal(payload, &decoded); err != nil {
		return nil, fmt.Errorf("decode cosmos accounts: %w", err)
	}
	accounts := make([]models.AzureCosmosAccount, 0, len(decoded))
	for _, item := range decoded {
		accounts = append(accounts, models.AzureCosmosAccount{
			Name:             item.Name,
			ResourceGroup:    item.ResourceGroup,
			DocumentEndpoint: item.DocumentEndpoint,
		})
	}
	sort.Slice(accounts, func(left, right int) bool {
		return strings.ToLower(accounts[left].Name) < strings.ToLower(accounts[right].Name)
	})
	return accounts, nil
}

// ListCosmosDatabases lists the SQL databases in an account.
func (i *Inventory) ListCosmosDatabases(
	ctx context.Context,
	profile models.ProfileSummary,
	account string,
	resourceGroup string,
) ([]models.AzureCosmosDatabase, error) {
	endpoint, key, err := i.cosmosTarget(ctx, profile, account, resourceGroup)
	if err != nil {
		return nil, err
	}
	raw, err := i.cosmosGet(ctx, endpoint, key, "dbs", "", "dbs", 0)
	if err != nil {
		return nil, err
	}
	var decoded struct {
		Databases []struct {
			ID string `json:"id"`
		} `json:"Databases"`
	}
	if err := json.Unmarshal(raw, &decoded); err != nil {
		return nil, fmt.Errorf("decode cosmos databases: %w", err)
	}
	databases := make([]models.AzureCosmosDatabase, 0, len(decoded.Databases))
	for _, item := range decoded.Databases {
		databases = append(databases, models.AzureCosmosDatabase{Name: item.ID})
	}
	return databases, nil
}

// ListCosmosContainers lists the containers in a database.
func (i *Inventory) ListCosmosContainers(
	ctx context.Context,
	profile models.ProfileSummary,
	account string,
	resourceGroup string,
	database string,
) ([]models.AzureCosmosContainer, error) {
	database = strings.TrimSpace(database)
	if database == "" {
		return nil, fmt.Errorf("a database is required")
	}
	endpoint, key, err := i.cosmosTarget(ctx, profile, account, resourceGroup)
	if err != nil {
		return nil, err
	}
	resLink := "dbs/" + database
	raw, err := i.cosmosGet(ctx, endpoint, key, "colls", resLink, resLink+"/colls", 0)
	if err != nil {
		return nil, err
	}
	var decoded struct {
		DocumentCollections []struct {
			ID           string `json:"id"`
			PartitionKey struct {
				Paths []string `json:"paths"`
			} `json:"partitionKey"`
		} `json:"DocumentCollections"`
	}
	if err := json.Unmarshal(raw, &decoded); err != nil {
		return nil, fmt.Errorf("decode cosmos containers: %w", err)
	}
	containers := make([]models.AzureCosmosContainer, 0, len(decoded.DocumentCollections))
	for _, item := range decoded.DocumentCollections {
		pk := ""
		if len(item.PartitionKey.Paths) > 0 {
			pk = item.PartitionKey.Paths[0]
		}
		containers = append(containers, models.AzureCosmosContainer{Name: item.ID, PartitionKey: pk})
	}
	return containers, nil
}

// ListCosmosItems samples documents from a container (bounded read).
func (i *Inventory) ListCosmosItems(
	ctx context.Context,
	profile models.ProfileSummary,
	account string,
	resourceGroup string,
	database string,
	container string,
) ([]models.AzureCosmosItem, error) {
	database = strings.TrimSpace(database)
	container = strings.TrimSpace(container)
	if database == "" || container == "" {
		return nil, fmt.Errorf("a database and container are required")
	}
	endpoint, key, err := i.cosmosTarget(ctx, profile, account, resourceGroup)
	if err != nil {
		return nil, err
	}
	resLink := "dbs/" + database + "/colls/" + container
	raw, err := i.cosmosGet(ctx, endpoint, key, "docs", resLink, resLink+"/docs", cosmosSampleLimit)
	if err != nil {
		return nil, err
	}
	var decoded struct {
		Documents []json.RawMessage `json:"Documents"`
	}
	if err := json.Unmarshal(raw, &decoded); err != nil {
		return nil, fmt.Errorf("decode cosmos documents: %w", err)
	}
	items := make([]models.AzureCosmosItem, 0, len(decoded.Documents))
	for _, doc := range decoded.Documents {
		var idHolder struct {
			ID string `json:"id"`
		}
		_ = json.Unmarshal(doc, &idHolder)
		items = append(items, models.AzureCosmosItem{ID: idHolder.ID, JSON: string(doc)})
	}
	return items, nil
}

// cosmosTarget resolves the data-plane endpoint and master key for an account.
func (i *Inventory) cosmosTarget(
	ctx context.Context,
	profile models.ProfileSummary,
	account string,
	resourceGroup string,
) (string, string, error) {
	account = strings.TrimSpace(account)
	if account == "" {
		return "", "", fmt.Errorf("a cosmos account is required")
	}
	if isLocalFlociProfile(profile) {
		return fmt.Sprintf("%s/%s-cosmos", i.flociBaseURL(), account), wellKnownCosmosKey, nil
	}
	resourceGroup = strings.TrimSpace(resourceGroup)
	if resourceGroup == "" {
		return "", "", fmt.Errorf("a resource group is required for a cloud cosmos account")
	}
	payload, err := i.run(ctx,
		"cosmosdb", "keys", "list",
		"--subscription", profile.ProfileID,
		"--name", account,
		"--resource-group", resourceGroup,
		"--output", "json",
		"--only-show-errors",
	)
	if err != nil {
		return "", "", err
	}
	var keys struct {
		PrimaryMasterKey string `json:"primaryMasterKey"`
	}
	if err := json.Unmarshal(payload, &keys); err != nil {
		return "", "", fmt.Errorf("decode cosmos keys: %w", err)
	}
	if keys.PrimaryMasterKey == "" {
		return "", "", fmt.Errorf("cosmos account %s returned no master key", account)
	}
	return fmt.Sprintf("https://%s.documents.azure.com", account), keys.PrimaryMasterKey, nil
}

// cosmosGet performs a signed Cosmos DB data-plane GET and returns the body.
func (i *Inventory) cosmosGet(ctx context.Context, endpoint, key, resType, resLink, path string, maxItems int) ([]byte, error) {
	date := time.Now().UTC().Format(http.TimeFormat)
	auth, err := cosmosAuthHeader("GET", resType, resLink, date, key)
	if err != nil {
		return nil, err
	}
	url := strings.TrimRight(endpoint, "/") + "/" + path
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	request.Header.Set("Authorization", auth)
	request.Header.Set("x-ms-date", date)
	request.Header.Set("x-ms-version", cosmosVersion)
	request.Header.Set("Accept", "application/json")
	if maxItems > 0 {
		request.Header.Set("x-ms-max-item-count", strconv.Itoa(maxItems))
	}
	response, err := http.DefaultClient.Do(request)
	if err != nil {
		return nil, fmt.Errorf("cosmos request: %w", err)
	}
	defer response.Body.Close()
	raw, _ := io.ReadAll(response.Body)
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return nil, fmt.Errorf("cosmos GET %s returned HTTP %d", path, response.StatusCode)
	}
	return raw, nil
}

// cosmosAuthHeader builds the Cosmos DB master-key authorization token.
func cosmosAuthHeader(verb, resType, resLink, date, masterKey string) (string, error) {
	keyBytes, err := base64.StdEncoding.DecodeString(masterKey)
	if err != nil {
		return "", fmt.Errorf("decode cosmos key: %w", err)
	}
	text := strings.ToLower(verb) + "\n" +
		strings.ToLower(resType) + "\n" +
		resLink + "\n" +
		strings.ToLower(date) + "\n" +
		"\n"
	mac := hmac.New(sha256.New, keyBytes)
	mac.Write([]byte(text))
	signature := base64.StdEncoding.EncodeToString(mac.Sum(nil))
	return url.QueryEscape("type=master&ver=1.0&sig=" + signature), nil
}

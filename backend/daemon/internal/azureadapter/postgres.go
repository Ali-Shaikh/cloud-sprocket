// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package azureadapter

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"sort"
	"strings"

	"cloudsprocket/backend/daemon/internal/models"
)

const (
	flociPostgresAccount = "devstoreaccount1-postgres"
	postgresAPIVersion   = "2025-08-01"
)

// ListPostgresServers returns flexible servers for the profile. floci-az lists per
// resource group over ARM; cloud uses the az CLI.
func (i *Inventory) ListPostgresServers(
	ctx context.Context,
	profile models.ProfileSummary,
) ([]models.AzurePostgresServer, error) {
	if isLocalFlociProfile(profile) {
		return i.listLocalPostgresServers(ctx)
	}
	payload, err := i.run(ctx,
		"postgres", "flexible-server", "list",
		"--subscription", profile.ProfileID,
		"--output", "json",
		"--only-show-errors",
	)
	if err != nil {
		return nil, err
	}
	return decodePostgresServers(payload, false)
}

func (i *Inventory) listLocalPostgresServers(ctx context.Context) ([]models.AzurePostgresServer, error) {
	groups, err := i.listLocalResourceGroups(ctx)
	if err != nil {
		return nil, err
	}
	servers := make([]models.AzurePostgresServer, 0)
	for _, group := range groups {
		batch, err := i.listLocalPostgresServersInGroup(ctx, group.Name)
		if err != nil {
			return nil, err
		}
		servers = append(servers, batch...)
	}
	sortPostgresServers(servers)
	return servers, nil
}

func (i *Inventory) listLocalPostgresServersInGroup(
	ctx context.Context,
	resourceGroup string,
) ([]models.AzurePostgresServer, error) {
	url := fmt.Sprintf(
		"%s/subscriptions/%s/resourceGroups/%s/providers/Microsoft.DBforPostgreSQL/flexibleServers?api-version=%s",
		i.flociBaseURL(),
		i.localSubscriptionID,
		resourceGroup,
		postgresAPIVersion,
	)
	var decoded struct {
		Value []json.RawMessage `json:"value"`
	}
	if err := i.flociJSON(ctx, http.MethodGet, url, nil, &decoded); err != nil {
		return nil, err
	}
	servers := make([]models.AzurePostgresServer, 0, len(decoded.Value))
	for _, raw := range decoded.Value {
		server, ok := decodePostgresServerARM(raw, resourceGroup, true)
		if ok {
			servers = append(servers, server)
		}
	}
	return servers, nil
}

// GetPostgresConnection returns ready-to-paste connection strings. Local floci-az
// serves full strings from /connect; cloud builds TLS templates without a password.
func (i *Inventory) GetPostgresConnection(
	ctx context.Context,
	profile models.ProfileSummary,
	resourceGroup string,
	serverName string,
) (models.AzurePostgresConnection, error) {
	serverName = strings.TrimSpace(serverName)
	if serverName == "" {
		return models.AzurePostgresConnection{}, fmt.Errorf("a server name is required")
	}
	if isLocalFlociProfile(profile) {
		return i.getLocalPostgresConnection(ctx, serverName)
	}
	resourceGroup = strings.TrimSpace(resourceGroup)
	if resourceGroup == "" {
		return models.AzurePostgresConnection{}, fmt.Errorf("a resource group is required")
	}
	payload, err := i.run(ctx,
		"postgres", "flexible-server", "show",
		"--subscription", profile.ProfileID,
		"--resource-group", resourceGroup,
		"--name", serverName,
		"--output", "json",
		"--only-show-errors",
	)
	if err != nil {
		return models.AzurePostgresConnection{}, err
	}
	return cloudPostgresConnection(payload)
}

func (i *Inventory) getLocalPostgresConnection(
	ctx context.Context,
	serverName string,
) (models.AzurePostgresConnection, error) {
	url := fmt.Sprintf("%s/%s/flexibleServers/%s/connect",
		i.flociBaseURL(), flociPostgresAccount, serverName)
	var decoded struct {
		Host    string `json:"host"`
		Port    int    `json:"port"`
		JDBCUrl string `json:"jdbcUrl"`
		URI     string `json:"uri"`
		Psql    string `json:"psql"`
		DotNet  string `json:"dotNet"`
	}
	if err := i.flociJSON(ctx, http.MethodGet, url, nil, &decoded); err != nil {
		return models.AzurePostgresConnection{}, err
	}
	return models.AzurePostgresConnection{
		Host:    decoded.Host,
		Port:    decoded.Port,
		JDBCUrl: decoded.JDBCUrl,
		URI:     decoded.URI,
		Psql:    decoded.Psql,
		DotNet:  decoded.DotNet,
	}, nil
}

func decodePostgresServers(payload []byte, local bool) ([]models.AzurePostgresServer, error) {
	var decoded []json.RawMessage
	if err := json.Unmarshal(payload, &decoded); err != nil {
		return nil, fmt.Errorf("decode postgres servers: %w", err)
	}
	servers := make([]models.AzurePostgresServer, 0, len(decoded))
	for _, raw := range decoded {
		rg := ""
		if !local {
			var holder struct {
				ResourceGroup string `json:"resourceGroup"`
			}
			_ = json.Unmarshal(raw, &holder)
			rg = holder.ResourceGroup
		}
		server, ok := decodePostgresServerARM(raw, rg, local)
		if ok {
			servers = append(servers, server)
		}
	}
	sortPostgresServers(servers)
	return servers, nil
}

func decodePostgresServerARM(raw json.RawMessage, resourceGroup string, local bool) (models.AzurePostgresServer, bool) {
	var item struct {
		ID         string `json:"id"`
		Name       string `json:"name"`
		Location   string `json:"location"`
		Tags       map[string]string `json:"tags"`
		SKU        struct {
			Name string `json:"name"`
		} `json:"sku"`
		Properties struct {
			Version            string `json:"version"`
			AdministratorLogin string `json:"administratorLogin"`
			ProvisioningState  string `json:"provisioningState"`
			State              string `json:"state"`
			FullyQualifiedDomainName string `json:"fullyQualifiedDomainName"`
			Storage            struct {
				StorageSizeGB int `json:"storageSizeGB"`
			} `json:"storage"`
		} `json:"properties"`
		// az CLI shape nests some fields at the top level.
		Version            string `json:"version"`
		AdministratorLogin string `json:"administratorLogin"`
		SKUName            string `json:"skuName"`
		StorageProfile     struct {
			StorageMB int `json:"storageMB"`
		} `json:"storageProfile"`
		FullyQualifiedDomainName string `json:"fullyQualifiedDomainName"`
		State                    string `json:"state"`
	}
	if err := json.Unmarshal(raw, &item); err != nil {
		return models.AzurePostgresServer{}, false
	}
	name := strings.TrimSpace(item.Name)
	if name == "" {
		return models.AzurePostgresServer{}, false
	}
	rg := strings.TrimSpace(resourceGroup)
	if rg == "" {
		rg = resourceGroupFromArmID(item.ID)
	}
	version := firstNonEmpty(item.Properties.Version, item.Version)
	admin := firstNonEmpty(item.Properties.AdministratorLogin, item.AdministratorLogin)
	sku := firstNonEmpty(item.SKU.Name, item.SKUName)
	storageMB := item.Properties.Storage.StorageSizeGB * 1024
	if storageMB == 0 {
		storageMB = item.StorageProfile.StorageMB
	}
	state := firstNonEmpty(item.Properties.ProvisioningState, item.Properties.State, item.State)
	fqdn := firstNonEmpty(item.Properties.FullyQualifiedDomainName, item.FullyQualifiedDomainName)
	if local && fqdn == "" {
		fqdn = "localhost"
	}
	return models.AzurePostgresServer{
		Name:               name,
		ResourceGroup:      rg,
		Location:           item.Location,
		Version:            version,
		AdministratorLogin: admin,
		SKU:                sku,
		StorageMB:          storageMB,
		ProvisioningState:  state,
		FQDN:               fqdn,
		Tags:               detailFieldsFromTags(item.Tags),
	}, true
}

func cloudPostgresConnection(payload []byte) (models.AzurePostgresConnection, error) {
	var item struct {
		FullyQualifiedDomainName string `json:"fullyQualifiedDomainName"`
		AdministratorLogin       string `json:"administratorLogin"`
	}
	if err := json.Unmarshal(payload, &item); err != nil {
		return models.AzurePostgresConnection{}, fmt.Errorf("decode postgres server: %w", err)
	}
	host := strings.TrimSpace(item.FullyQualifiedDomainName)
	admin := strings.TrimSpace(item.AdministratorLogin)
	if host == "" {
		return models.AzurePostgresConnection{}, fmt.Errorf("postgres server returned no FQDN")
	}
	return models.AzurePostgresConnection{
		Host:    host,
		Port:    5432,
		JDBCUrl: fmt.Sprintf("jdbc:postgresql://%s:5432/postgres?user=%s&sslmode=require", host, admin),
		URI:     fmt.Sprintf("postgresql://%s@%s:5432/postgres?sslmode=require", admin, host),
		Psql:    fmt.Sprintf(`psql "host=%s port=5432 dbname=postgres user=%s sslmode=require"`, host, admin),
		DotNet:  fmt.Sprintf("Host=%s;Port=5432;Database=postgres;Username=%s;SSL Mode=Require;", host, admin),
		Note:    "Password not exposed via Azure inventory. Use deployment outputs or Key Vault.",
	}, nil
}

func resourceGroupFromArmID(id string) string {
	parts := strings.Split(strings.Trim(id, "/"), "/")
	for index, part := range parts {
		if strings.EqualFold(part, "resourceGroups") && index+1 < len(parts) {
			return parts[index+1]
		}
	}
	return ""
}

func sortPostgresServers(servers []models.AzurePostgresServer) {
	sort.Slice(servers, func(left, right int) bool {
		return strings.ToLower(servers[left].Name) < strings.ToLower(servers[right].Name)
	})
}
package azureadapter

import (
	"context"
	"encoding/json"
	"fmt"
	"sort"
	"strings"

	"cloudsprocket/backend/daemon/internal/models"
)

func (i *Inventory) ListBastionHosts(ctx context.Context, profile models.ProfileSummary) ([]models.AzureBastionHost, error) {
	if isLocalFlociProfile(profile) {
		return []models.AzureBastionHost{}, nil
	}
	args := []string{
		"network", "bastion", "list",
		"--subscription", profile.ProfileID,
		"--output", "json",
		"--only-show-errors",
	}
	payload, err := i.run(ctx, args...)
	if err != nil {
		return nil, err
	}
	var decoded []struct {
		Name          string `json:"name"`
		ResourceGroup string `json:"resourceGroup"`
		Location      string `json:"location"`
		SKU           struct {
			Name string `json:"name"`
		} `json:"sku"`
	}
	if err := json.Unmarshal(payload, &decoded); err != nil {
		return nil, fmt.Errorf("decode azure bastion hosts: %w", err)
	}
	hosts := make([]models.AzureBastionHost, 0, len(decoded))
	for _, item := range decoded {
		hosts = append(hosts, models.AzureBastionHost{
			Name:          item.Name,
			ResourceGroup: item.ResourceGroup,
			Location:      item.Location,
			SKU:           item.SKU.Name,
		})
	}
	sort.Slice(hosts, func(left, right int) bool {
		return strings.ToLower(hosts[left].Name) < strings.ToLower(hosts[right].Name)
	})
	return hosts, nil
}
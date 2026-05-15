package azureadapter

import (
	"context"
	"encoding/json"
	"fmt"
	"os/exec"
	"sort"
	"strings"

	"cloudsprocket/backend/daemon/internal/config"
	"cloudsprocket/backend/daemon/internal/models"
)

type CLIExecutor interface {
	CommandContext(ctx context.Context, name string, args ...string) ([]byte, error)
}

type execRunner struct{}

func (execRunner) CommandContext(ctx context.Context, name string, args ...string) ([]byte, error) {
	return exec.CommandContext(ctx, name, args...).Output()
}

type Inventory struct {
	settings config.Settings
	runner   CLIExecutor
}

func NewInventory(settings config.Settings) *Inventory {
	return &Inventory{settings: settings, runner: execRunner{}}
}

func (i *Inventory) ListResourceGroups(ctx context.Context, profile models.ProfileSummary) ([]models.AzureResourceGroup, error) {
	args := []string{"group", "list", "--subscription", profile.ProfileID, "--output", "json", "--only-show-errors"}
	payload, err := i.run(ctx, args...)
	if err != nil {
		return nil, err
	}
	var decoded []struct {
		Name              string            `json:"name"`
		Location          string            `json:"location"`
		ManagedBy         string            `json:"managedBy"`
		Properties        struct {
			ProvisioningState string `json:"provisioningState"`
		} `json:"properties"`
		Tags map[string]string `json:"tags"`
	}
	if err := json.Unmarshal(payload, &decoded); err != nil {
		return nil, fmt.Errorf("decode azure resource groups: %w", err)
	}
	groups := make([]models.AzureResourceGroup, 0, len(decoded))
	for _, item := range decoded {
		groups = append(groups, models.AzureResourceGroup{
			Name:              item.Name,
			Location:          item.Location,
			ProvisioningState: item.Properties.ProvisioningState,
			ManagedBy:         item.ManagedBy,
			Tags:              detailFieldsFromTags(item.Tags),
		})
	}
	sort.Slice(groups, func(left int, right int) bool {
		return strings.ToLower(groups[left].Name) < strings.ToLower(groups[right].Name)
	})
	return groups, nil
}

func (i *Inventory) ListVirtualMachines(ctx context.Context, profile models.ProfileSummary, resourceGroup string) ([]models.AzureVirtualMachine, error) {
	args := []string{"vm", "list", "--subscription", profile.ProfileID, "--resource-group", resourceGroup, "--show-details", "--output", "json", "--only-show-errors"}
	payload, err := i.run(ctx, args...)
	if err != nil {
		return nil, err
	}
	var decoded []struct {
		ID              string `json:"id"`
		Name            string `json:"name"`
		ResourceGroup   string `json:"resourceGroup"`
		Location        string `json:"location"`
		PowerState      string `json:"powerState"`
		ProvisioningState string `json:"provisioningState"`
		HardwareProfile struct {
			VMSize string `json:"vmSize"`
		} `json:"hardwareProfile"`
		StorageProfile struct {
			OSDisk struct {
				OSType string `json:"osType"`
			} `json:"osDisk"`
		} `json:"storageProfile"`
		PrivateIps string            `json:"privateIps"`
		PublicIps  string            `json:"publicIps"`
		Tags       map[string]string `json:"tags"`
	}
	if err := json.Unmarshal(payload, &decoded); err != nil {
		return nil, fmt.Errorf("decode azure virtual machines: %w", err)
	}
	vms := make([]models.AzureVirtualMachine, 0, len(decoded))
	for _, item := range decoded {
		vms = append(vms, models.AzureVirtualMachine{
			VMID:              item.ID,
			Name:              item.Name,
			ResourceGroup:     item.ResourceGroup,
			Location:          item.Location,
			PowerState:        item.PowerState,
			ProvisioningState: item.ProvisioningState,
			Size:              item.HardwareProfile.VMSize,
			OSType:            item.StorageProfile.OSDisk.OSType,
			PrivateIP:         item.PrivateIps,
			PublicIP:          item.PublicIps,
			Tags:              detailFieldsFromTags(item.Tags),
		})
	}
	sort.Slice(vms, func(left int, right int) bool {
		return strings.ToLower(vms[left].Name) < strings.ToLower(vms[right].Name)
	})
	return vms, nil
}

func (i *Inventory) run(ctx context.Context, args ...string) ([]byte, error) {
	runner := i.runner
	if runner == nil {
		runner = execRunner{}
	}
	payload, err := runner.CommandContext(ctx, "az", args...)
	if err != nil {
		return nil, fmt.Errorf("az %s: %w", strings.Join(args, " "), err)
	}
	return payload, nil
}

func detailFieldsFromTags(tags map[string]string) []models.DetailField {
	if len(tags) == 0 {
		return nil
	}
	keys := make([]string, 0, len(tags))
	for key := range tags {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	fields := make([]models.DetailField, 0, len(keys))
	for _, key := range keys {
		fields = append(fields, models.DetailField{Label: key, Value: tags[key]})
	}
	return fields
}

// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package gcpadapter

import (
	"context"
	"encoding/json"
	"fmt"
	"path"
	"sort"
	"strings"

	"cloudsprocket/backend/daemon/internal/models"
)

// ListInstances returns Compute Engine VMs for the profile project via
// `gcloud compute instances list --format=json`.
func (i *Inventory) ListInstances(
	ctx context.Context,
	profile models.ProfileSummary,
) ([]models.GcpComputeInstance, error) {
	args := []string{
		"compute", "instances", "list",
		"--format=json",
	}
	if project := projectFromProfile(profile); project != "" {
		args = append(args, "--project", project)
	}
	payload, err := i.run(ctx, profile, args...)
	if err != nil {
		return nil, err
	}
	return decodeComputeInstances(payload)
}

// StartInstance starts a Compute Engine VM via
// `gcloud compute instances start NAME --zone=ZONE`.
func (i *Inventory) StartInstance(
	ctx context.Context,
	profile models.ProfileSummary,
	instanceName string,
	zone string,
) error {
	return i.invokeInstanceLifecycle(ctx, profile, "start", instanceName, zone)
}

// StopInstance stops a Compute Engine VM via
// `gcloud compute instances stop NAME --zone=ZONE`.
func (i *Inventory) StopInstance(
	ctx context.Context,
	profile models.ProfileSummary,
	instanceName string,
	zone string,
) error {
	return i.invokeInstanceLifecycle(ctx, profile, "stop", instanceName, zone)
}

func (i *Inventory) invokeInstanceLifecycle(
	ctx context.Context,
	profile models.ProfileSummary,
	action string,
	instanceName string,
	zone string,
) error {
	name := strings.TrimSpace(instanceName)
	zoneName := resourceBasename(zone)
	if name == "" || zoneName == "" {
		return fmt.Errorf("instance name and zone are required")
	}
	args := []string{
		"compute", "instances", action,
		name,
		"--zone=" + zoneName,
	}
	if project := projectFromProfile(profile); project != "" {
		args = append(args, "--project", project)
	}
	_, err := i.run(ctx, profile, args...)
	return err
}

func decodeComputeInstances(payload []byte) ([]models.GcpComputeInstance, error) {
	trimmed := strings.TrimSpace(string(payload))
	if trimmed == "" || trimmed == "null" || trimmed == "[]" {
		return []models.GcpComputeInstance{}, nil
	}
	// gcloud may emit either an array or a single object depending on result count.
	var decoded []instanceJSON
	if err := json.Unmarshal(payload, &decoded); err != nil {
		var single instanceJSON
		if singleErr := json.Unmarshal(payload, &single); singleErr != nil {
			return nil, fmt.Errorf("decode gcloud compute instances: %w", err)
		}
		if name := strings.TrimSpace(single.Name); name != "" {
			return []models.GcpComputeInstance{mapInstanceJSON(single)}, nil
		}
		return []models.GcpComputeInstance{}, nil
	}
	instances := make([]models.GcpComputeInstance, 0, len(decoded))
	for _, item := range decoded {
		if strings.TrimSpace(item.Name) == "" {
			continue
		}
		instances = append(instances, mapInstanceJSON(item))
	}
	sort.Slice(instances, func(left int, right int) bool {
		return strings.ToLower(instances[left].Name) < strings.ToLower(instances[right].Name)
	})
	return instances, nil
}

type instanceJSON struct {
	Name              string `json:"name"`
	Zone              string `json:"zone"`
	MachineType       string `json:"machineType"`
	Status            string `json:"status"`
	CreationTimestamp string `json:"creationTimestamp"`
	NetworkInterfaces []struct {
		NetworkIP     string `json:"networkIP"`
		AccessConfigs []struct {
			NatIP string `json:"natIP"`
		} `json:"accessConfigs"`
	} `json:"networkInterfaces"`
}

func mapInstanceJSON(item instanceJSON) models.GcpComputeInstance {
	zone := resourceBasename(item.Zone)
	machineType := resourceBasename(item.MachineType)
	internalIP, externalIP := firstNetworkIPs(item)
	entry := models.GcpComputeInstance{
		Name:        strings.TrimSpace(item.Name),
		Zone:        zone,
		MachineType: machineType,
		Status:      strings.TrimSpace(item.Status),
		InternalIP:  internalIP,
		ExternalIP:  externalIP,
		CreatedAt:   strings.TrimSpace(item.CreationTimestamp),
	}
	parts := make([]string, 0, 4)
	if entry.Zone != "" {
		parts = append(parts, entry.Zone)
	}
	if entry.MachineType != "" {
		parts = append(parts, entry.MachineType)
	}
	if entry.Status != "" {
		parts = append(parts, entry.Status)
	}
	if entry.InternalIP != "" {
		parts = append(parts, entry.InternalIP)
	}
	entry.Summary = strings.Join(parts, " · ")
	return entry
}

func firstNetworkIPs(item instanceJSON) (internalIP string, externalIP string) {
	if len(item.NetworkInterfaces) == 0 {
		return "", ""
	}
	iface := item.NetworkInterfaces[0]
	internalIP = strings.TrimSpace(iface.NetworkIP)
	for _, access := range iface.AccessConfigs {
		if nat := strings.TrimSpace(access.NatIP); nat != "" {
			externalIP = nat
			break
		}
	}
	return internalIP, externalIP
}

// resourceBasename returns the last path segment of a self-link or plain name.
func resourceBasename(raw string) string {
	value := strings.TrimSpace(raw)
	if value == "" {
		return ""
	}
	if strings.Contains(value, "/") {
		return path.Base(value)
	}
	return value
}

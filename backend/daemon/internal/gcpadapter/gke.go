// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package gcpadapter

import (
	"context"
	"encoding/json"
	"fmt"
	"sort"
	"strings"

	"cloudsprocket/backend/daemon/internal/models"
)

// ListClusters returns GKE clusters for the profile project via
// `gcloud container clusters list --format=json`.
func (i *Inventory) ListClusters(
	ctx context.Context,
	profile models.ProfileSummary,
) ([]models.GcpGkeCluster, error) {
	args := []string{
		"container", "clusters", "list",
		"--format=json",
	}
	if project := projectFromProfile(profile); project != "" {
		args = append(args, "--project", project)
	}
	payload, err := i.run(ctx, profile, args...)
	if err != nil {
		return nil, err
	}
	return decodeGkeClusters(payload)
}

func decodeGkeClusters(payload []byte) ([]models.GcpGkeCluster, error) {
	trimmed := strings.TrimSpace(string(payload))
	if trimmed == "" || trimmed == "null" || trimmed == "[]" {
		return []models.GcpGkeCluster{}, nil
	}
	// gcloud may emit either an array or a single object depending on result count.
	var decoded []clusterJSON
	if err := json.Unmarshal(payload, &decoded); err != nil {
		var single clusterJSON
		if singleErr := json.Unmarshal(payload, &single); singleErr != nil {
			return nil, fmt.Errorf("decode gcloud container clusters: %w", err)
		}
		if name := strings.TrimSpace(single.Name); name != "" {
			return []models.GcpGkeCluster{mapClusterJSON(single)}, nil
		}
		return []models.GcpGkeCluster{}, nil
	}
	clusters := make([]models.GcpGkeCluster, 0, len(decoded))
	for _, item := range decoded {
		if strings.TrimSpace(item.Name) == "" {
			continue
		}
		clusters = append(clusters, mapClusterJSON(item))
	}
	sort.Slice(clusters, func(left int, right int) bool {
		return strings.ToLower(clusters[left].Name) < strings.ToLower(clusters[right].Name)
	})
	return clusters, nil
}

type clusterJSON struct {
	Name                 string `json:"name"`
	Location             string `json:"location"`
	Status               string `json:"status"`
	CurrentMasterVersion string `json:"currentMasterVersion"`
	CurrentNodeCount     int    `json:"currentNodeCount"`
	Endpoint             string `json:"endpoint"`
	CreateTime           string `json:"createTime"`
	Autopilot            *struct {
		Enabled bool `json:"enabled"`
	} `json:"autopilot"`
}

func mapClusterJSON(item clusterJSON) models.GcpGkeCluster {
	mode := "Standard"
	if item.Autopilot != nil && item.Autopilot.Enabled {
		mode = "Autopilot"
	}
	entry := models.GcpGkeCluster{
		Name:          strings.TrimSpace(item.Name),
		Location:      strings.TrimSpace(item.Location),
		Status:        strings.TrimSpace(item.Status),
		MasterVersion: strings.TrimSpace(item.CurrentMasterVersion),
		NodeCount:     item.CurrentNodeCount,
		Endpoint:      strings.TrimSpace(item.Endpoint),
		Mode:          mode,
		CreatedAt:     strings.TrimSpace(item.CreateTime),
	}
	parts := make([]string, 0, 4)
	if entry.Location != "" {
		parts = append(parts, entry.Location)
	}
	if entry.Mode != "" {
		parts = append(parts, entry.Mode)
	}
	if entry.MasterVersion != "" {
		parts = append(parts, entry.MasterVersion)
	}
	if entry.Status != "" {
		parts = append(parts, entry.Status)
	}
	entry.Summary = strings.Join(parts, " · ")
	return entry
}

// ListNodePools returns node pools for a GKE cluster via
// `gcloud container node-pools list --cluster --location --format=json`.
func (i *Inventory) ListNodePools(
	ctx context.Context,
	profile models.ProfileSummary,
	clusterName string,
	location string,
) ([]models.GcpGkeNodePool, error) {
	clusterName = strings.TrimSpace(clusterName)
	location = strings.TrimSpace(location)
	if clusterName == "" {
		return nil, fmt.Errorf("cluster name is required")
	}
	if location == "" {
		return nil, fmt.Errorf("cluster location is required")
	}
	args := []string{
		"container", "node-pools", "list",
		"--cluster", clusterName,
		"--location", location,
		"--format=json",
	}
	if project := projectFromProfile(profile); project != "" {
		args = append(args, "--project", project)
	}
	payload, err := i.run(ctx, profile, args...)
	if err != nil {
		return nil, err
	}
	return decodeGkeNodePools(payload)
}

func decodeGkeNodePools(payload []byte) ([]models.GcpGkeNodePool, error) {
	trimmed := strings.TrimSpace(string(payload))
	if trimmed == "" || trimmed == "null" || trimmed == "[]" {
		return []models.GcpGkeNodePool{}, nil
	}
	var decoded []nodePoolJSON
	if err := json.Unmarshal(payload, &decoded); err != nil {
		var single nodePoolJSON
		if singleErr := json.Unmarshal(payload, &single); singleErr != nil {
			return nil, fmt.Errorf("decode gcloud container node-pools: %w", err)
		}
		if name := strings.TrimSpace(single.Name); name != "" {
			return []models.GcpGkeNodePool{mapNodePoolJSON(single)}, nil
		}
		return []models.GcpGkeNodePool{}, nil
	}
	pools := make([]models.GcpGkeNodePool, 0, len(decoded))
	for _, item := range decoded {
		if strings.TrimSpace(item.Name) == "" {
			continue
		}
		pools = append(pools, mapNodePoolJSON(item))
	}
	sort.Slice(pools, func(left int, right int) bool {
		return strings.ToLower(pools[left].Name) < strings.ToLower(pools[right].Name)
	})
	return pools, nil
}

type nodePoolJSON struct {
	Name             string   `json:"name"`
	Status           string   `json:"status"`
	Version          string   `json:"version"`
	InitialNodeCount int      `json:"initialNodeCount"`
	Locations        []string `json:"locations"`
	Config           *struct {
		MachineType string `json:"machineType"`
		DiskSizeGb  int    `json:"diskSizeGb"`
	} `json:"config"`
	Autoscaling *struct {
		Enabled      bool `json:"enabled"`
		MinNodeCount int  `json:"minNodeCount"`
		MaxNodeCount int  `json:"maxNodeCount"`
	} `json:"autoscaling"`
}

func mapNodePoolJSON(item nodePoolJSON) models.GcpGkeNodePool {
	entry := models.GcpGkeNodePool{
		Name:             strings.TrimSpace(item.Name),
		Status:           strings.TrimSpace(item.Status),
		Version:          strings.TrimSpace(item.Version),
		InitialNodeCount: item.InitialNodeCount,
		Locations:        strings.Join(item.Locations, ", "),
	}
	if item.Config != nil {
		entry.MachineType = strings.TrimSpace(item.Config.MachineType)
		entry.DiskSizeGb = item.Config.DiskSizeGb
	}
	if item.Autoscaling != nil {
		entry.AutoscalingEnabled = item.Autoscaling.Enabled
		entry.MinNodeCount = item.Autoscaling.MinNodeCount
		entry.MaxNodeCount = item.Autoscaling.MaxNodeCount
	}
	parts := make([]string, 0, 4)
	if entry.MachineType != "" {
		parts = append(parts, entry.MachineType)
	}
	if entry.Version != "" {
		parts = append(parts, entry.Version)
	}
	if entry.AutoscalingEnabled {
		parts = append(parts, fmt.Sprintf("autoscale %d-%d", entry.MinNodeCount, entry.MaxNodeCount))
	} else if entry.InitialNodeCount > 0 {
		parts = append(parts, fmt.Sprintf("%d node(s)", entry.InitialNodeCount))
	}
	if entry.Status != "" {
		parts = append(parts, entry.Status)
	}
	entry.Summary = strings.Join(parts, " · ")
	return entry
}

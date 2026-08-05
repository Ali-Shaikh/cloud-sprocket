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

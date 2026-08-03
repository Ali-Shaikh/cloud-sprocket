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

// ListBuckets returns Cloud Storage buckets for the profile project via
// `gcloud storage buckets list --format=json`.
func (i *Inventory) ListBuckets(
	ctx context.Context,
	profile models.ProfileSummary,
) ([]models.GcpStorageBucket, error) {
	args := []string{
		"storage", "buckets", "list",
		"--format=json",
	}
	if project := projectFromProfile(profile); project != "" {
		args = append(args, "--project", project)
	}
	payload, err := i.run(ctx, profile, args...)
	if err != nil {
		return nil, err
	}
	return decodeStorageBuckets(payload)
}

func decodeStorageBuckets(payload []byte) ([]models.GcpStorageBucket, error) {
	trimmed := strings.TrimSpace(string(payload))
	if trimmed == "" || trimmed == "null" || trimmed == "[]" {
		return []models.GcpStorageBucket{}, nil
	}
	// gcloud may emit either an array or a single object depending on result count.
	var decoded []bucketJSON
	if err := json.Unmarshal(payload, &decoded); err != nil {
		var single bucketJSON
		if singleErr := json.Unmarshal(payload, &single); singleErr != nil {
			return nil, fmt.Errorf("decode gcloud storage buckets: %w", err)
		}
		if name := normaliseBucketName(single.Name); name != "" {
			return []models.GcpStorageBucket{mapBucketJSON(single)}, nil
		}
		return []models.GcpStorageBucket{}, nil
	}
	buckets := make([]models.GcpStorageBucket, 0, len(decoded))
	for _, item := range decoded {
		name := normaliseBucketName(item.Name)
		if name == "" {
			continue
		}
		buckets = append(buckets, mapBucketJSON(item))
	}
	sort.Slice(buckets, func(left int, right int) bool {
		return strings.ToLower(buckets[left].Name) < strings.ToLower(buckets[right].Name)
	})
	return buckets, nil
}

type bucketJSON struct {
	Name                string `json:"name"`
	Location            string `json:"location"`
	LocationType        string `json:"location_type"`
	LocationTypeAlt     string `json:"locationType"`
	DefaultStorageClass string `json:"default_storage_class"`
	StorageClass        string `json:"storage_class"`
	StorageClassAlt     string `json:"storageClass"`
	CreationTime        string `json:"creation_time"`
	TimeCreated         string `json:"timeCreated"`
	CreateTime          string `json:"createTime"`
}

func mapBucketJSON(item bucketJSON) models.GcpStorageBucket {
	name := normaliseBucketName(item.Name)
	locationType := firstNonEmpty(item.LocationType, item.LocationTypeAlt)
	storageClass := firstNonEmpty(item.DefaultStorageClass, item.StorageClass, item.StorageClassAlt)
	createdAt := firstNonEmpty(item.CreationTime, item.TimeCreated, item.CreateTime)
	entry := models.GcpStorageBucket{
		Name:         name,
		Location:     item.Location,
		LocationType: locationType,
		StorageClass: storageClass,
		CreatedAt:    createdAt,
	}
	parts := make([]string, 0, 3)
	if entry.Location != "" {
		parts = append(parts, entry.Location)
	}
	if entry.StorageClass != "" {
		parts = append(parts, entry.StorageClass)
	}
	if entry.LocationType != "" {
		parts = append(parts, entry.LocationType)
	}
	entry.Summary = strings.Join(parts, " · ")
	return entry
}

// normaliseBucketName strips gs:// prefixes and trailing slashes from gcloud names.
func normaliseBucketName(raw string) string {
	name := strings.TrimSpace(raw)
	name = strings.TrimPrefix(name, "gs://")
	name = strings.TrimSuffix(name, "/")
	return strings.TrimSpace(name)
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if trimmed := strings.TrimSpace(value); trimmed != "" {
			return trimmed
		}
	}
	return ""
}

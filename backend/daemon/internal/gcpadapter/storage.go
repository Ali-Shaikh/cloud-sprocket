// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package gcpadapter

import (
	"context"
	"encoding/json"
	"fmt"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/dustin/go-humanize"

	"cloudsprocket/backend/daemon/internal/models"
)

// ObjectListPageSize is one page of GCS keys/folders returned to the browser.
const ObjectListPageSize = 100

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

// SignURL issues a short-lived read URL via `gcloud storage sign-url`.
// durationSeconds is clamped to [60, 12 hours]; default is one hour (gcloud default).
// System-managed signing keys cap duration at 12 hours.
func (i *Inventory) SignURL(
	ctx context.Context,
	profile models.ProfileSummary,
	bucketName string,
	objectKey string,
	durationSeconds int,
) (models.GcpStorageSignURLResult, error) {
	bucket := normaliseBucketName(bucketName)
	key := strings.TrimSpace(objectKey)
	key = strings.TrimPrefix(key, "/")
	if bucket == "" || key == "" {
		return models.GcpStorageSignURLResult{}, fmt.Errorf("bucket name and object key are required")
	}
	if strings.HasSuffix(key, "/") {
		return models.GcpStorageSignURLResult{}, fmt.Errorf("signed URLs are not supported for folder prefixes")
	}
	durationSeconds = clampGcpSignURLDuration(durationSeconds)
	uri := "gs://" + bucket + "/" + key
	args := []string{
		"storage", "sign-url",
		uri,
		"--duration=" + strconv.Itoa(durationSeconds) + "s",
		"--http-verb=GET",
		"--format=json",
	}
	if project := projectFromProfile(profile); project != "" {
		args = append(args, "--project", project)
	}
	payload, err := i.run(ctx, profile, args...)
	if err != nil {
		return models.GcpStorageSignURLResult{}, err
	}
	url, err := decodeSignedURL(payload)
	if err != nil {
		return models.GcpStorageSignURLResult{}, err
	}
	expiresAt := time.Now().UTC().Add(time.Duration(durationSeconds) * time.Second).Format(time.RFC3339)
	return models.GcpStorageSignURLResult{
		BucketName:      bucket,
		ObjectKey:       key,
		URL:             url,
		DurationSeconds: durationSeconds,
		ExpiresAt:       expiresAt,
	}, nil
}

func clampGcpSignURLDuration(durationSeconds int) int {
	const (
		defaultSeconds = 3600
		minSeconds     = 60
		// gcloud storage sign-url caps system-managed keys at 12 hours.
		maxSeconds = 12 * 60 * 60
	)
	if durationSeconds <= 0 {
		return defaultSeconds
	}
	if durationSeconds < minSeconds {
		return minSeconds
	}
	if durationSeconds > maxSeconds {
		return maxSeconds
	}
	return durationSeconds
}

func decodeSignedURL(payload []byte) (string, error) {
	trimmed := strings.TrimSpace(string(payload))
	if trimmed == "" || trimmed == "null" || trimmed == "[]" {
		return "", fmt.Errorf("gcloud storage sign-url returned empty output")
	}
	// Prefer structured JSON (array or single object).
	type signedRow struct {
		SignedURL    string `json:"signed_url"`
		SignedURLAlt string `json:"signedUrl"`
		URL          string `json:"url"`
		ResourceURL  string `json:"resource_url"`
	}
	var rows []signedRow
	if err := json.Unmarshal(payload, &rows); err == nil {
		for _, row := range rows {
			if url := firstNonEmpty(row.SignedURL, row.SignedURLAlt, row.URL); url != "" {
				return url, nil
			}
		}
	}
	var single signedRow
	if err := json.Unmarshal(payload, &single); err == nil {
		if url := firstNonEmpty(single.SignedURL, single.SignedURLAlt, single.URL); url != "" {
			return url, nil
		}
	}
	// Fallback: first https URL in free-form text (table output).
	for _, line := range strings.Split(trimmed, "\n") {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, "https://") {
			// Table rows may include trailing columns; take the first token.
			fields := strings.Fields(line)
			if len(fields) > 0 && strings.HasPrefix(fields[0], "https://") {
				return fields[0], nil
			}
			return line, nil
		}
		// Scan tokens on non-URL-leading lines for a signed URL column.
		for _, field := range strings.Fields(line) {
			if strings.HasPrefix(field, "https://") && strings.Contains(field, "X-Goog-") {
				return field, nil
			}
			if strings.HasPrefix(field, "https://storage.googleapis.com/") ||
				strings.HasPrefix(field, "https://storage.cloud.google.com/") {
				return field, nil
			}
		}
	}
	return "", fmt.Errorf("could not parse signed URL from gcloud output")
}

// UploadObject copies a local file to gs://bucket/key via `gcloud storage cp`.
func (i *Inventory) UploadObject(
	ctx context.Context,
	profile models.ProfileSummary,
	bucketName string,
	objectKey string,
	sourcePath string,
) (models.GcpStorageUploadResult, error) {
	bucket := normaliseBucketName(bucketName)
	key := strings.TrimSpace(objectKey)
	key = strings.TrimPrefix(key, "/")
	source := strings.TrimSpace(sourcePath)
	if bucket == "" || key == "" || source == "" {
		return models.GcpStorageUploadResult{}, fmt.Errorf("bucket name, object key, and source path are required")
	}
	destination := "gs://" + bucket + "/" + key
	args := []string{
		"storage", "cp",
		source,
		destination,
	}
	if project := projectFromProfile(profile); project != "" {
		args = append(args, "--project", project)
	}
	if _, err := i.run(ctx, profile, args...); err != nil {
		return models.GcpStorageUploadResult{}, err
	}
	return models.GcpStorageUploadResult{
		BucketName:     bucket,
		ObjectKey:      key,
		DestinationURI: destination,
	}, nil
}

// DeleteObject removes gs://bucket/key via `gcloud storage rm`.
func (i *Inventory) DeleteObject(
	ctx context.Context,
	profile models.ProfileSummary,
	bucketName string,
	objectKey string,
) error {
	bucket := normaliseBucketName(bucketName)
	key := strings.TrimSpace(objectKey)
	key = strings.TrimPrefix(key, "/")
	if bucket == "" || key == "" {
		return fmt.Errorf("bucket name and object key are required")
	}
	uri := "gs://" + bucket + "/" + key
	args := []string{
		"storage", "rm",
		uri,
	}
	if project := projectFromProfile(profile); project != "" {
		args = append(args, "--project", project)
	}
	_, err := i.run(ctx, profile, args...)
	return err
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

// ListObjects returns one delimiter-scoped page of objects and virtual folders
// under prefix via `gcloud storage ls --json gs://bucket/[prefix]`.
// Non-recursive listing treats "/" as directories so the browser can navigate folders.
func (i *Inventory) ListObjects(
	ctx context.Context,
	profile models.ProfileSummary,
	bucketName string,
	prefix string,
	pageToken string,
) (models.GcpStorageObjectListPage, error) {
	bucket := normaliseBucketName(bucketName)
	if bucket == "" {
		return models.GcpStorageObjectListPage{}, fmt.Errorf("bucket name is required")
	}
	path := objectListURL(bucket, prefix)
	args := []string{
		"storage", "ls",
		"--json",
	}
	if token := strings.TrimSpace(pageToken); token != "" {
		args = append(args, "--next-page-token="+token)
	}
	if project := projectFromProfile(profile); project != "" {
		args = append(args, "--project", project)
	}
	args = append(args, path)
	payload, err := i.run(ctx, profile, args...)
	if err != nil {
		return models.GcpStorageObjectListPage{}, err
	}
	return decodeStorageObjects(payload, bucket, prefix)
}

func objectListURL(bucket string, prefix string) string {
	cleanPrefix := strings.TrimSpace(prefix)
	cleanPrefix = strings.TrimPrefix(cleanPrefix, "/")
	if cleanPrefix == "" {
		return "gs://" + bucket
	}
	// Directory listing under a prefix requires a trailing slash so gcloud
	// returns the current level rather than matching the prefix as a name.
	if !strings.HasSuffix(cleanPrefix, "/") {
		cleanPrefix += "/"
	}
	return "gs://" + bucket + "/" + cleanPrefix
}

func decodeStorageObjects(
	payload []byte,
	bucket string,
	prefix string,
) (models.GcpStorageObjectListPage, error) {
	trimmed := strings.TrimSpace(string(payload))
	if trimmed == "" || trimmed == "null" || trimmed == "[]" {
		return models.GcpStorageObjectListPage{Entries: []models.GcpStorageObject{}}, nil
	}

	// Prefer a wrapped page (items + nextPageToken) when present; fall back to a bare array.
	var wrapped objectListJSON
	if err := json.Unmarshal(payload, &wrapped); err == nil && (len(wrapped.Items) > 0 || len(wrapped.Prefixes) > 0 || wrapped.NextPageToken != "") {
		return mapObjectListJSON(wrapped, bucket, prefix), nil
	}

	var decoded []json.RawMessage
	if err := json.Unmarshal(payload, &decoded); err != nil {
		var single json.RawMessage
		if singleErr := json.Unmarshal(payload, &single); singleErr != nil {
			return models.GcpStorageObjectListPage{}, fmt.Errorf("decode gcloud storage objects: %w", err)
		}
		decoded = []json.RawMessage{single}
	}

	entries := make([]models.GcpStorageObject, 0, len(decoded))
	seen := make(map[string]struct{}, len(decoded))
	for _, raw := range decoded {
		entry, ok := mapObjectRaw(raw, bucket, prefix)
		if !ok {
			continue
		}
		if _, exists := seen[entry.Key]; exists {
			continue
		}
		seen[entry.Key] = struct{}{}
		entries = append(entries, entry)
	}
	sortObjectEntries(entries)
	return models.GcpStorageObjectListPage{Entries: entries}, nil
}

type objectListJSON struct {
	Items            []objectJSON `json:"items"`
	Prefixes         []string     `json:"prefixes"`
	NextPageToken    string       `json:"nextPageToken"`
	NextPageTokenAlt string       `json:"next_page_token"`
}

type objectJSON struct {
	// Common gcloud storage ls --json shapes.
	URL            string          `json:"url"`
	Type           string          `json:"type"`
	Name           string          `json:"name"`
	Bucket         string          `json:"bucket"`
	Size           json.RawMessage `json:"size"`
	SizeAlt        json.RawMessage `json:"size_bytes"`
	ContentType    string          `json:"contentType"`
	ContentTypeAlt string          `json:"content_type"`
	Updated        string          `json:"updated"`
	TimeCreated    string          `json:"timeCreated"`
	TimeCreatedAlt string          `json:"time_created"`
	StorageClass   string          `json:"storageClass"`
	// Nested metadata blob used by some gcloud versions.
	Metadata *objectJSON `json:"metadata"`
}

func mapObjectListJSON(
	wrapped objectListJSON,
	bucket string,
	prefix string,
) models.GcpStorageObjectListPage {
	entries := make([]models.GcpStorageObject, 0, len(wrapped.Prefixes)+len(wrapped.Items))
	seen := make(map[string]struct{}, len(wrapped.Prefixes)+len(wrapped.Items))
	for _, folder := range wrapped.Prefixes {
		key := objectKeyFromURL(folder, bucket)
		if key == "" || key == normalisePrefix(prefix) {
			continue
		}
		if !strings.HasSuffix(key, "/") {
			key += "/"
		}
		if _, exists := seen[key]; exists {
			continue
		}
		seen[key] = struct{}{}
		entries = append(entries, models.GcpStorageObject{
			Key:      key,
			IsFolder: true,
			Size:     "Folder",
		})
	}
	for _, item := range wrapped.Items {
		entry, ok := mapObjectJSON(item, bucket, prefix)
		if !ok {
			continue
		}
		if _, exists := seen[entry.Key]; exists {
			continue
		}
		seen[entry.Key] = struct{}{}
		entries = append(entries, entry)
	}
	sortObjectEntries(entries)
	token := firstNonEmpty(wrapped.NextPageToken, wrapped.NextPageTokenAlt)
	return models.GcpStorageObjectListPage{
		Entries:       entries,
		NextPageToken: token,
		IsTruncated:   token != "",
	}
}

func mapObjectRaw(raw json.RawMessage, bucket string, prefix string) (models.GcpStorageObject, bool) {
	// Bare URL string (prefix or object URI).
	var asString string
	if err := json.Unmarshal(raw, &asString); err == nil {
		key := objectKeyFromURL(asString, bucket)
		if key == "" || key == normalisePrefix(prefix) {
			return models.GcpStorageObject{}, false
		}
		if strings.HasSuffix(asString, "/") || strings.HasSuffix(key, "/") {
			if !strings.HasSuffix(key, "/") {
				key += "/"
			}
			return models.GcpStorageObject{Key: key, IsFolder: true, Size: "Folder"}, true
		}
		return models.GcpStorageObject{Key: key}, true
	}
	var item objectJSON
	if err := json.Unmarshal(raw, &item); err != nil {
		return models.GcpStorageObject{}, false
	}
	return mapObjectJSON(item, bucket, prefix)
}

func mapObjectJSON(item objectJSON, bucket string, prefix string) (models.GcpStorageObject, bool) {
	// Prefer nested metadata when present (gcloud resource wrapper).
	if item.Metadata != nil {
		nested := *item.Metadata
		if nested.URL == "" {
			nested.URL = item.URL
		}
		if nested.Type == "" {
			nested.Type = item.Type
		}
		item = nested
	}

	typeHint := strings.ToLower(strings.TrimSpace(item.Type))
	url := strings.TrimSpace(item.URL)
	name := strings.TrimSpace(item.Name)

	// Prefix / virtual folder rows.
	if typeHint == "prefix" ||
		(url != "" && strings.HasSuffix(url, "/") && name == "") ||
		(name != "" && strings.HasSuffix(name, "/") && item.Size == nil) {
		key := firstNonEmpty(objectKeyFromURL(url, bucket), name)
		if key == "" || key == normalisePrefix(prefix) {
			return models.GcpStorageObject{}, false
		}
		if !strings.HasSuffix(key, "/") {
			key += "/"
		}
		return models.GcpStorageObject{Key: key, IsFolder: true, Size: "Folder"}, true
	}

	key := firstNonEmpty(name, objectKeyFromURL(url, bucket))
	if key == "" || key == normalisePrefix(prefix) {
		return models.GcpStorageObject{}, false
	}
	// Folder marker objects that equal the current prefix are already skipped.
	if strings.HasSuffix(key, "/") && isEmptySize(item.Size) {
		return models.GcpStorageObject{Key: key, IsFolder: true, Size: "Folder"}, true
	}

	entry := models.GcpStorageObject{
		Key:         key,
		ContentType: firstNonEmpty(item.ContentType, item.ContentTypeAlt),
		Updated:     firstNonEmpty(item.Updated, item.TimeCreated, item.TimeCreatedAlt),
		Size:        formatObjectSize(item.Size, item.SizeAlt),
	}
	return entry, true
}

func objectKeyFromURL(raw string, bucket string) string {
	value := strings.TrimSpace(raw)
	if value == "" {
		return ""
	}
	// Absolute gs:// URL: strip scheme and optional bucket segment.
	if strings.HasPrefix(value, "gs://") {
		value = strings.TrimPrefix(value, "gs://")
		if bucket != "" {
			if strings.HasPrefix(value, bucket+"/") {
				return strings.TrimPrefix(value, bucket+"/")
			}
			if value == bucket || value == bucket+"/" {
				return ""
			}
		}
		// Unknown bucket: drop the first path segment.
		if idx := strings.Index(value, "/"); idx >= 0 {
			return value[idx+1:]
		}
		return ""
	}
	// Relative key or prefix already (e.g. "logs/" from API prefixes[]).
	if bucket != "" {
		if strings.HasPrefix(value, bucket+"/") {
			return strings.TrimPrefix(value, bucket+"/")
		}
		if value == bucket || value == bucket+"/" {
			return ""
		}
	}
	return value
}

func normalisePrefix(prefix string) string {
	clean := strings.TrimSpace(prefix)
	clean = strings.TrimPrefix(clean, "/")
	if clean == "" {
		return ""
	}
	if !strings.HasSuffix(clean, "/") {
		clean += "/"
	}
	return clean
}

func isEmptySize(raw json.RawMessage) bool {
	if len(raw) == 0 {
		return true
	}
	trimmed := strings.TrimSpace(string(raw))
	return trimmed == "" || trimmed == "null" || trimmed == "0" || trimmed == `"0"`
}

func formatObjectSize(primary json.RawMessage, alt json.RawMessage) string {
	for _, raw := range []json.RawMessage{primary, alt} {
		if len(raw) == 0 {
			continue
		}
		var asNumber float64
		if err := json.Unmarshal(raw, &asNumber); err == nil {
			if asNumber < 0 {
				continue
			}
			return humanize.Bytes(uint64(asNumber))
		}
		var asString string
		if err := json.Unmarshal(raw, &asString); err == nil {
			asString = strings.TrimSpace(asString)
			if asString == "" {
				continue
			}
			if parsed, err := strconv.ParseUint(asString, 10, 64); err == nil {
				return humanize.Bytes(parsed)
			}
			// Already humanised by gcloud (e.g. with --readable-sizes style fields).
			return asString
		}
	}
	return ""
}

func sortObjectEntries(entries []models.GcpStorageObject) {
	sort.SliceStable(entries, func(left int, right int) bool {
		if entries[left].IsFolder != entries[right].IsFolder {
			return entries[left].IsFolder
		}
		return strings.ToLower(entries[left].Key) < strings.ToLower(entries[right].Key)
	})
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

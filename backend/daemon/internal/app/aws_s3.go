// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package app

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"sync"

	"cloudsprocket/backend/daemon/internal/discovery"
	"cloudsprocket/backend/daemon/internal/models"
	"cloudsprocket/backend/daemon/internal/urlinspector"
)

func (s *Service) activeS3Selection(
	snapshot discovery.Snapshot,
	session models.SessionSnapshot,
	requireBucket bool,
) (models.ProfileSummary, string, error) {
	if !session.IsLocked || session.CurrentProviderID != "aws" {
		return models.ProfileSummary{}, "", errors.New("open an AWS workspace before using S3 actions")
	}
	profile, ok := findProfile(filterProfiles(snapshot.Profiles, session.CurrentProviderID), session.SelectedProfileID)
	if !ok {
		return models.ProfileSummary{}, "", errors.New("the workspace's AWS profile is not available")
	}
	bucketName := session.SelectedS3BucketName
	if bucketName == "" && requireBucket {
		bucketName = s.selectedS3BucketName(session, s.s3Buckets(context.Background(), profile))
	}
	if requireBucket && bucketName == "" {
		return models.ProfileSummary{}, "", errors.New("select an S3 bucket before using this action")
	}
	return profile, bucketName, nil
}

func (s *Service) selectedS3BucketName(
	session models.SessionSnapshot,
	buckets []models.AwsS3Bucket,
) string {
	if session.SelectedS3BucketName != "" {
		for _, bucket := range buckets {
			if bucket.Name == session.SelectedS3BucketName {
				return session.SelectedS3BucketName
			}
		}
	}
	if len(buckets) == 0 {
		return ""
	}
	return buckets[0].Name
}

// withAzureTimeout bounds an Azure inventory call. A non-positive configured
// timeout (e.g. a directly-constructed test Service) leaves the context as-is.

func (s *Service) selectedS3ObjectKey(
	session models.SessionSnapshot,
	objects []models.AwsS3Object,
) string {
	if session.SelectedS3ObjectKey != "" {
		for _, object := range objects {
			if object.IsFolder {
				continue
			}
			if object.Key == session.SelectedS3ObjectKey {
				return session.SelectedS3ObjectKey
			}
		}
	}
	// Prefer the first real object; never auto-select a folder row.
	for _, object := range objects {
		if !object.IsFolder {
			return object.Key
		}
	}
	return ""
}

func (s *Service) s3Buckets(
	ctx context.Context,
	profile models.ProfileSummary,
) []models.AwsS3Bucket {
	const scope = "aws.s3.buckets"

	queryHash := profile.ProfileID

	var cached []models.AwsS3Bucket
	if fetchedAt, ok, _ := s.loadCachedResource(ctx, scope, queryHash, &cached); ok {
		for index := range cached {
			if cached[index].Summary == "" {
				cached[index].Summary = "Cached " + fetchedAt
			}
		}
		return cached
	}

	buckets, err := s.s3.ListBuckets(ctx, profile)
	if err == nil {
		fetchedAt := s.timestamp()
		if saveErr := s.saveResourceCacheWithTTL(ctx, scope, queryHash, buckets); saveErr == nil {
			for index := range buckets {
				if buckets[index].Summary == "" {
					buckets[index].Summary = "Fetched " + fetchedAt
				}
			}
		}
		return buckets
	}

	fetchedAt, ok, cacheErr := s.store.LoadResourceCache(ctx, scope, queryHash, &cached)
	if cacheErr == nil && ok {
		for index := range cached {
			if cached[index].Summary == "" {
				cached[index].Summary = "Cached " + fetchedAt
			}
		}
		return cached
	}

	return []models.AwsS3Bucket{}
}

func (s *Service) s3ObjectPage(
	ctx context.Context,
	profile models.ProfileSummary,
	bucketName string,
	prefix string,
	continuationToken string,
) models.AwsS3ObjectListPage {
	if bucketName == "" {
		return models.AwsS3ObjectListPage{}
	}
	// First page may use a short TTL cache; paginated tokens are never cached.
	if continuationToken == "" {
		const scope = "aws.s3.objects.page"
		queryHash := profile.ProfileID + "|" + bucketName + "|" + prefix
		var cached models.AwsS3ObjectListPage
		if _, ok, _ := s.loadCachedResource(ctx, scope, queryHash, &cached); ok {
			return cached
		}
		page, err := s.s3.ListObjects(ctx, profile, bucketName, prefix, "")
		if err == nil {
			_ = s.saveResourceCacheWithTTL(ctx, scope, queryHash, page)
			return page
		}
		if _, ok, cacheErr := s.store.LoadResourceCache(ctx, scope, queryHash, &cached); cacheErr == nil && ok {
			return cached
		}
		return models.AwsS3ObjectListPage{}
	}
	page, err := s.s3.ListObjects(ctx, profile, bucketName, prefix, continuationToken)
	if err != nil {
		return models.AwsS3ObjectListPage{}
	}
	return page
}

// s3Objects is used by write paths that only need keys under a prefix (no pagination).
func (s *Service) s3Objects(
	ctx context.Context,
	profile models.ProfileSummary,
	bucketName string,
	prefix string,
) []models.AwsS3Object {
	return s.s3ObjectPage(ctx, profile, bucketName, prefix, "").Entries
}

func (s *Service) s3ObjectMetadata(
	ctx context.Context,
	profile models.ProfileSummary,
	bucketName string,
	objectKey string,
) []models.DetailField {
	if bucketName == "" || objectKey == "" {
		return []models.DetailField{}
	}

	const scope = "aws.s3.object-metadata"
	queryHash := profile.ProfileID + "|" + bucketName + "|" + objectKey

	var cached []models.DetailField
	if _, ok, _ := s.loadCachedResource(ctx, scope, queryHash, &cached); ok {
		return cached
	}

	fields, err := s.s3.HeadObject(ctx, profile, bucketName, objectKey)
	if err == nil {
		_ = s.saveResourceCacheWithTTL(ctx, scope, queryHash, fields)
		return fields
	}

	_, ok, cacheErr := s.store.LoadResourceCache(ctx, scope, queryHash, &cached)
	if cacheErr == nil && ok {
		return cached
	}

	return []models.DetailField{}
}

func (s *Service) s3ExportSnippets(bucketName string, objectKey string) []models.AwsS3ExportSnippet {
	if bucketName == "" || objectKey == "" {
		return []models.AwsS3ExportSnippet{}
	}
	s3URI := fmt.Sprintf("s3://%s/%s", bucketName, objectKey)
	return []models.AwsS3ExportSnippet{
		{
			Label: "S3 URI",
			Value: s3URI,
		},
		{
			Label: "AWS CLI copy command",
			Value: fmt.Sprintf("aws s3 cp %q .", s3URI),
		},
		{
			Label: "AWS CLI presign command",
			Value: fmt.Sprintf("aws s3 presign %q --expires-in 3600", s3URI),
		},
	}
}

func (s *Service) enrichS3Inventory(
	workspace *models.WorkspaceSnapshot,
	session models.SessionSnapshot,
	opts awsEnrichmentOptions,
	mu *sync.Mutex,
) {
	if workspace.Provider == nil ||
		workspace.Provider.ProviderID != "aws" ||
		workspace.Profile == nil ||
		s.s3 == nil {
		return
	}
	timeoutCtx, cancel := s.withAWSTimeout(context.Background())
	buckets := s.s3Buckets(timeoutCtx, *workspace.Profile)
	cancel()
	selectedBucket := s.selectedS3BucketName(session, buckets)

	if opts.lightweight {
		status := "No buckets are currently available for this AWS workspace."
		if len(buckets) > 0 {
			if selectedBucket == "" {
				status = fmt.Sprintf("Loaded %d bucket(s). Select one to browse objects.", len(buckets))
			} else {
				status = fmt.Sprintf("Loaded %d bucket(s). Select %s to browse objects.", len(buckets), selectedBucket)
			}
		}
		lockWorkspace(mu, func() {
			workspace.S3Buckets = buckets
			workspace.SelectedS3BucketName = selectedBucket
			workspace.S3PrefixFilter = session.S3PrefixFilter
			workspace.S3Objects = []models.AwsS3Object{}
			workspace.SelectedS3ObjectKey = ""
			workspace.S3ObjectMetadata = nil
			workspace.S3ExportSnippets = nil
			workspace.S3StatusMessage = status
		})
		return
	}

	timeoutCtx, cancel = s.withAWSTimeout(context.Background())
	page := s.s3ObjectPage(
		timeoutCtx,
		*workspace.Profile,
		selectedBucket,
		session.S3PrefixFilter,
		"",
	)
	cancel()
	objects := page.Entries
	selectedObject := s.selectedS3ObjectKey(session, objects)
	timeoutCtx, cancel = s.withAWSTimeout(context.Background())
	metadata := s.s3ObjectMetadata(
		timeoutCtx,
		*workspace.Profile,
		selectedBucket,
		selectedObject,
	)
	cancel()
	snippets := s.s3ExportSnippets(selectedBucket, selectedObject)

	status := "No buckets are currently available for this AWS workspace."
	if selectedBucket != "" {
		folderCount := 0
		fileCount := 0
		for _, entry := range objects {
			if entry.IsFolder {
				folderCount++
			} else {
				fileCount++
			}
		}
		location := selectedBucket
		if session.S3PrefixFilter != "" {
			location = selectedBucket + "/" + strings.TrimSuffix(session.S3PrefixFilter, "/")
		}
		switch {
		case folderCount == 0 && fileCount == 0:
			status = fmt.Sprintf("This folder is empty in %s. Open a folder above or use the breadcrumb.", location)
		case page.IsTruncated:
			status = fmt.Sprintf(
				"Showing %d folder(s) and %d object(s) in %s. More results available — use Load more.",
				folderCount,
				fileCount,
				location,
			)
		default:
			status = fmt.Sprintf(
				"%d folder(s) and %d object(s) in %s. Click a folder to open it.",
				folderCount,
				fileCount,
				location,
			)
		}
	}

	lockWorkspace(mu, func() {
		workspace.S3Buckets = buckets
		workspace.SelectedS3BucketName = selectedBucket
		workspace.S3PrefixFilter = session.S3PrefixFilter
		workspace.S3Objects = objects
		workspace.S3ObjectsNextToken = page.NextContinuationToken
		workspace.S3ObjectsHasMore = page.IsTruncated || page.NextContinuationToken != ""
		workspace.SelectedS3ObjectKey = selectedObject
		workspace.S3ObjectMetadata = metadata
		workspace.S3ExportSnippets = snippets
		workspace.S3StatusMessage = status
	})
}

func (s *Service) handleAwsS3AnalyseUrl(params json.RawMessage) (any, error) {
	var request struct {
		URL string `json:"url"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	return urlinspector.AnalyseURL(request.URL, s.now()), nil
}

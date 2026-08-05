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
)

func (s *Service) gcpStorageBucketsResult(
	ctx context.Context,
	profile models.ProfileSummary,
) ([]models.GcpStorageBucket, error) {
	if s.gcpStorage == nil {
		return []models.GcpStorageBucket{}, nil
	}
	const scope = "gcp.storage.buckets"
	queryHash := profile.ProfileID

	if s.store != nil {
		var cached []models.GcpStorageBucket
		if fetchedAt, ok, _ := s.loadCachedResource(ctx, scope, queryHash, &cached); ok {
			for index := range cached {
				if cached[index].Summary == "" {
					cached[index].Summary = "Cached " + fetchedAt
				}
			}
			return cached, nil
		}
	}

	buckets, err := s.gcpStorage.ListBuckets(ctx, profile)
	if err == nil {
		if s.store != nil {
			fetchedAt := s.timestamp()
			if saveErr := s.saveResourceCacheWithTTL(ctx, scope, queryHash, buckets); saveErr == nil {
				for index := range buckets {
					if buckets[index].Summary == "" {
						buckets[index].Summary = "Fetched " + fetchedAt
					}
				}
			}
		}
		return buckets, nil
	}

	if s.store != nil {
		var cached []models.GcpStorageBucket
		fetchedAt, ok, cacheErr := s.store.LoadResourceCache(ctx, scope, queryHash, &cached)
		if cacheErr == nil && ok {
			for index := range cached {
				if cached[index].Summary == "" {
					cached[index].Summary = "Cached " + fetchedAt
				}
			}
			return cached, err
		}
	}

	return []models.GcpStorageBucket{}, err
}

func (s *Service) selectedGcpStorageBucket(
	session models.SessionSnapshot,
	buckets []models.GcpStorageBucket,
) string {
	if session.SelectedGcpStorageBucket != "" {
		for _, bucket := range buckets {
			if bucket.Name == session.SelectedGcpStorageBucket {
				return session.SelectedGcpStorageBucket
			}
		}
	}
	return ""
}

func (s *Service) gcpStorageObjectPage(
	ctx context.Context,
	profile models.ProfileSummary,
	bucketName string,
	prefix string,
	pageToken string,
) (models.GcpStorageObjectListPage, error) {
	if s.gcpStorage == nil || bucketName == "" {
		return models.GcpStorageObjectListPage{Entries: []models.GcpStorageObject{}}, nil
	}
	// First page may use a short TTL cache; paginated tokens are never cached.
	if pageToken == "" {
		const scope = "gcp.storage.objects.page"
		queryHash := profile.ProfileID + "|" + bucketName + "|" + prefix
		if s.store != nil {
			var cached models.GcpStorageObjectListPage
			if _, ok, _ := s.loadCachedResource(ctx, scope, queryHash, &cached); ok {
				return cached, nil
			}
		}
		page, err := s.gcpStorage.ListObjects(ctx, profile, bucketName, prefix, "")
		if err == nil {
			if s.store != nil {
				_ = s.saveResourceCacheWithTTL(ctx, scope, queryHash, page)
			}
			return page, nil
		}
		if s.store != nil {
			var cached models.GcpStorageObjectListPage
			if _, ok, cacheErr := s.store.LoadResourceCache(ctx, scope, queryHash, &cached); cacheErr == nil && ok {
				return cached, err
			}
		}
		return models.GcpStorageObjectListPage{Entries: []models.GcpStorageObject{}}, err
	}
	return s.gcpStorage.ListObjects(ctx, profile, bucketName, prefix, pageToken)
}

func (s *Service) enrichGcpStorageInventory(
	workspace *models.WorkspaceSnapshot,
	session models.SessionSnapshot,
	mu *sync.Mutex,
) {
	if workspace.Provider == nil ||
		workspace.Provider.ProviderID != "gcp" ||
		workspace.Profile == nil ||
		s.gcpStorage == nil {
		return
	}
	if !s.isServiceEnabled("gcp", "gcp-storage") {
		return
	}

	ctx, cancel := s.withAzureTimeout(context.Background())
	defer cancel()
	profile := *workspace.Profile

	buckets, listErr := s.gcpStorageBucketsResult(ctx, profile)
	selected := s.selectedGcpStorageBucket(session, buckets)
	prefix := session.GcpStoragePrefixFilter

	var (
		objects []models.GcpStorageObject
		nextTok string
		hasMore bool
		objErr  error
	)
	if selected != "" {
		page, err := s.gcpStorageObjectPage(ctx, profile, selected, prefix, "")
		objErr = err
		objects = page.Entries
		if objects == nil {
			objects = []models.GcpStorageObject{}
		}
		nextTok = page.NextPageToken
		hasMore = page.IsTruncated || page.NextPageToken != ""
	} else {
		objects = []models.GcpStorageObject{}
	}

	status := gcpStorageStatusMessage(buckets, selected, prefix, objects, hasMore, listErr, objErr)

	lockWorkspace(mu, func() {
		workspace.GcpStorageBuckets = buckets
		workspace.SelectedGcpStorageBucket = selected
		workspace.GcpStoragePrefixFilter = prefix
		workspace.GcpStorageObjects = objects
		workspace.GcpStorageObjectsNextToken = nextTok
		workspace.GcpStorageObjectsHasMore = hasMore
		workspace.GcpStorageStatusMessage = status
	})
}

func gcpStorageStatusMessage(
	buckets []models.GcpStorageBucket,
	selected string,
	prefix string,
	objects []models.GcpStorageObject,
	hasMore bool,
	listErr error,
	objErr error,
) string {
	switch {
	case listErr != nil && len(buckets) == 0:
		return fmt.Sprintf(
			"Could not list Cloud Storage buckets.\nCheck that gcloud is installed, authenticated, and the active configuration has a project.\nDetail: %v",
			listErr,
		)
	case len(buckets) == 0:
		return "No Cloud Storage buckets are currently available for this GCP project."
	case selected == "":
		return fmt.Sprintf("Loaded %d Cloud Storage bucket(s). Select one to browse objects.", len(buckets))
	case objErr != nil && len(objects) == 0:
		return fmt.Sprintf(
			"Could not list objects in %s.\nCheck that the bucket exists and the active gcloud identity has storage.objects.list.\nDetail: %v",
			selected,
			objErr,
		)
	}

	folderCount := 0
	fileCount := 0
	for _, entry := range objects {
		if entry.IsFolder {
			folderCount++
		} else {
			fileCount++
		}
	}
	location := selected
	if prefix != "" {
		location = selected + "/" + strings.TrimSuffix(prefix, "/")
	}
	switch {
	case folderCount == 0 && fileCount == 0:
		return fmt.Sprintf("This folder is empty in %s. Open a folder above or use the breadcrumb.", location)
	case hasMore:
		return fmt.Sprintf(
			"Showing %d folder(s) and %d object(s) in %s. More results available - use Load more.",
			folderCount,
			fileCount,
			location,
		)
	default:
		return fmt.Sprintf(
			"%d folder(s) and %d object(s) in %s. Click a folder to open it.",
			folderCount,
			fileCount,
			location,
		)
	}
}

// enrichGcpWorkspace loads enabled GCP service inventories for a workspace snapshot.
func (s *Service) enrichGcpWorkspace(
	workspace *models.WorkspaceSnapshot,
	session models.SessionSnapshot,
) {
	if workspace.Provider == nil ||
		workspace.Provider.ProviderID != "gcp" ||
		workspace.Profile == nil {
		return
	}
	s.enrichGcpStorageInventory(workspace, session, nil)
	s.enrichGcpComputeInventory(workspace, session, nil)
	s.enrichGcpFunctionsInventory(workspace, session, nil)
	s.enrichGcpGkeInventory(workspace, session, nil)
}

func (s *Service) withLockedGcpWorkspace(
	ctx context.Context,
	guardMsg string,
	mutate func(*models.SessionSnapshot) error,
) (discovery.Snapshot, models.SessionSnapshot, error) {
	snapshot, err := s.discovery.Discover()
	if err != nil {
		return discovery.Snapshot{}, models.SessionSnapshot{}, err
	}
	session, err := s.Update(ctx, snapshot, func(sess *models.SessionSnapshot) error {
		if !sess.IsLocked || sess.CurrentProviderID != "gcp" {
			return errors.New(guardMsg)
		}
		if mutate != nil {
			return mutate(sess)
		}
		return nil
	})
	if err != nil {
		return discovery.Snapshot{}, models.SessionSnapshot{}, err
	}
	return snapshot, session, nil
}

func (s *Service) finishGcpWorkspace(
	ctx context.Context,
	snapshot discovery.Snapshot,
	session models.SessionSnapshot,
	notifier Notifier,
	logLevel string,
	logMsg string,
) (models.WorkspaceSnapshot, error) {
	workspace := s.Build(ctx, snapshot, session, snapshotOptionsToPort(workspaceSnapshotOptions{
		skipAwsInventory:   true,
		skipAzureInventory: true,
	}))
	if logMsg == "" {
		return workspace, nil
	}
	return workspace, s.NotifyStateAndLog(ctx, snapshot, session, notifier, logLevel, logMsg)
}

func (s *Service) handleGcpStorageSelectBucket(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
	var request struct {
		BucketName string `json:"bucketName"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	bucketName := strings.TrimSpace(request.BucketName)
	snapshot, session, err := s.withLockedGcpWorkspace(ctx, "open a GCP workspace before selecting a Cloud Storage bucket", func(session *models.SessionSnapshot) error {
		session.SelectedGcpStorageBucket = bucketName
		// Bucket paths are not portable: always open the new bucket at its root.
		session.GcpStoragePrefixFilter = ""
		return nil
	})
	if err != nil {
		return nil, err
	}
	s.invalidateResourceCacheScope(ctx, "gcp.storage.objects.page")
	label := bucketName
	if label == "" {
		label = "none"
	}
	return s.finishGcpWorkspace(ctx, snapshot, session, notifier, "info", fmt.Sprintf("Selected Cloud Storage bucket %s.", label))
}

func (s *Service) handleGcpStorageSetPrefixFilter(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
	var request struct {
		Prefix string `json:"prefix"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	snapshot, session, err := s.withLockedGcpWorkspace(ctx, "open a GCP workspace before setting a Cloud Storage prefix filter", func(session *models.SessionSnapshot) error {
		if strings.TrimSpace(session.SelectedGcpStorageBucket) == "" {
			return errors.New("select a Cloud Storage bucket before opening a folder")
		}
		session.GcpStoragePrefixFilter = request.Prefix
		return nil
	})
	if err != nil {
		return nil, err
	}
	// Opening a folder must re-list the first page for the new prefix.
	s.invalidateResourceCacheScope(ctx, "gcp.storage.objects.page")
	label := "bucket root"
	if strings.TrimSpace(request.Prefix) != "" {
		label = request.Prefix
	}
	return s.finishGcpWorkspace(ctx, snapshot, session, notifier, "info", fmt.Sprintf("Opened folder %s.", label))
}

func (s *Service) handleGcpStorageLoadMoreObjects(ctx context.Context, params json.RawMessage, _ Notifier) (any, error) {
	if s.gcpStorage == nil {
		return nil, errors.New("GCP Cloud Storage inventory is not available")
	}
	var request struct {
		PageToken string `json:"pageToken"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	token := strings.TrimSpace(request.PageToken)
	if token == "" {
		return nil, errors.New("page token is required to load more objects")
	}
	snapshot, err := s.discovery.Discover()
	if err != nil {
		return nil, err
	}
	session, err := s.Load(ctx, snapshot)
	if err != nil {
		return nil, err
	}
	if !session.IsLocked || session.CurrentProviderID != "gcp" {
		return nil, errors.New("open a GCP workspace before listing Cloud Storage objects")
	}
	profile, ok := findProfile(filterProfiles(snapshot.Profiles, session.CurrentProviderID), session.SelectedProfileID)
	if !ok {
		return nil, errors.New("the workspace's GCP profile is not available")
	}
	bucket := strings.TrimSpace(session.SelectedGcpStorageBucket)
	if bucket == "" {
		return nil, errors.New("select a Cloud Storage bucket before loading more objects")
	}

	timeoutCtx, cancel := s.withAzureTimeout(ctx)
	page, listErr := s.gcpStorageObjectPage(timeoutCtx, profile, bucket, session.GcpStoragePrefixFilter, token)
	cancel()
	if listErr != nil {
		return nil, fmt.Errorf("could not load more Cloud Storage objects: %w", listErr)
	}

	workspace := s.Build(ctx, snapshot, session, snapshotOptionsToPort(workspaceSnapshotOptions{
		skipAwsInventory:   true,
		skipAzureInventory: true,
	}))
	// Replace browser fields with the next page only; the UI appends to the list.
	workspace.GcpStorageObjects = page.Entries
	if workspace.GcpStorageObjects == nil {
		workspace.GcpStorageObjects = []models.GcpStorageObject{}
	}
	workspace.GcpStorageObjectsNextToken = page.NextPageToken
	workspace.GcpStorageObjectsHasMore = page.IsTruncated || page.NextPageToken != ""
	workspace.GcpStoragePrefixFilter = session.GcpStoragePrefixFilter
	workspace.SelectedGcpStorageBucket = bucket
	moreNote := "End of list."
	if workspace.GcpStorageObjectsHasMore {
		moreNote = "More results available."
	}
	workspace.GcpStorageStatusMessage = fmt.Sprintf("Loaded %d more item(s). %s", len(page.Entries), moreNote)
	return workspace, nil
}

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
			if object.Key == session.SelectedS3ObjectKey {
				return session.SelectedS3ObjectKey
			}
		}
	}
	if len(objects) == 0 {
		return ""
	}
	return objects[0].Key
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

func (s *Service) s3Objects(
	ctx context.Context,
	profile models.ProfileSummary,
	bucketName string,
	prefix string,
) []models.AwsS3Object {
	if bucketName == "" {
		return []models.AwsS3Object{}
	}

	const scope = "aws.s3.objects"
	queryHash := profile.ProfileID + "|" + bucketName + "|" + prefix

	var cached []models.AwsS3Object
	if _, ok, _ := s.loadCachedResource(ctx, scope, queryHash, &cached); ok {
		return cached
	}

	objects, err := s.s3.ListObjects(ctx, profile, bucketName, prefix)
	if err == nil {
		_ = s.saveResourceCacheWithTTL(ctx, scope, queryHash, objects)
		return objects
	}

	_, ok, cacheErr := s.store.LoadResourceCache(ctx, scope, queryHash, &cached)
	if cacheErr == nil && ok {
		return cached
	}

	return []models.AwsS3Object{}
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
	objects := s.s3Objects(
		timeoutCtx,
		*workspace.Profile,
		selectedBucket,
		session.S3PrefixFilter,
	)
	cancel()
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
		if len(objects) == 0 {
			if session.S3PrefixFilter != "" {
				status = fmt.Sprintf(
					"No objects matched prefix %q in %s.",
					session.S3PrefixFilter,
					selectedBucket,
				)
			} else {
				status = fmt.Sprintf("No objects were returned for %s.", selectedBucket)
			}
		} else {
			status = fmt.Sprintf("Loaded %d objects from %s.", len(objects), selectedBucket)
		}
	}

	lockWorkspace(mu, func() {
		workspace.S3Buckets = buckets
		workspace.SelectedS3BucketName = selectedBucket
		workspace.S3Objects = objects
		workspace.SelectedS3ObjectKey = selectedObject
		workspace.S3ObjectMetadata = metadata
		workspace.S3ExportSnippets = snippets
		workspace.S3StatusMessage = status
	})
}

func (s *Service) handleAwsS3SelectBucket(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
	var request struct {
		BucketName string `json:"bucketName"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	snapshot, session, err := s.withLockedAWSWorkspace(ctx, "open an AWS workspace before selecting an S3 bucket", func(session *models.SessionSnapshot) error {
		session.SelectedS3BucketName = request.BucketName
		session.SelectedS3ObjectKey = ""
		return nil
	})
	if err != nil {
		return nil, err
	}
	return s.finishAWSWorkspaceOpts(ctx, snapshot, session, notifier, workspaceSnapshotOptions{awsScope: "s3", skipAzureInventory: true}, "info", fmt.Sprintf("Selected S3 bucket %s.", request.BucketName), false)
}

func (s *Service) handleAwsS3SelectObject(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
	var request struct {
		ObjectKey string `json:"objectKey"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	snapshot, session, err := s.withLockedAWSWorkspace(ctx, "select an S3 bucket before selecting an object", func(session *models.SessionSnapshot) error {
		if session.SelectedS3BucketName == "" {
			return errors.New("select an S3 bucket before selecting an object")
		}
		session.SelectedS3ObjectKey = request.ObjectKey
		return nil
	})
	if err != nil {
		return nil, err
	}
	return s.finishAWSWorkspaceOpts(ctx, snapshot, session, notifier, workspaceSnapshotOptions{awsScope: "s3", skipAzureInventory: true}, "", "", false)
}

func (s *Service) handleAwsS3SetPrefixFilter(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
	var request struct {
		Prefix string `json:"prefix"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	snapshot, session, err := s.withLockedAWSWorkspace(ctx, "open an AWS workspace before setting an S3 prefix filter", func(session *models.SessionSnapshot) error {
		session.S3PrefixFilter = request.Prefix
		session.SelectedS3ObjectKey = ""
		return nil
	})
	if err != nil {
		return nil, err
	}
	return s.finishAWSWorkspaceOpts(ctx, snapshot, session, notifier, workspaceSnapshotOptions{awsScope: "s3", skipAzureInventory: true}, "info", fmt.Sprintf("Updated S3 prefix filter to %q.", request.Prefix), false)
}

func (s *Service) handleAwsS3UploadObject(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
	var request struct {
		SourcePath string `json:"sourcePath"`
		ObjectKey  string `json:"objectKey"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	if strings.TrimSpace(request.SourcePath) == "" || strings.TrimSpace(request.ObjectKey) == "" {
		return nil, errors.New("source path and destination object key are required")
	}
	snapshot, err := s.discovery.Discover()
	if err != nil {
		return nil, err
	}
	s.mu.Lock()
	session, err := s.currentState(ctx, snapshot)
	if err != nil {
		s.mu.Unlock()
		return nil, err
	}
	profile, bucketName, err := s.activeS3Selection(snapshot, session, true)
	if err != nil {
		s.mu.Unlock()
		return nil, err
	}
	if !effectiveAWSWritesEnabled(session, profile) {
		s.mu.Unlock()
		return nil, errors.New("S3 uploads require write mode to be enabled and a profile with local endpoint_url and cloudsprocket_allow_writes = true")
	}
	if err := validateS3UploadRequest(request.SourcePath, request.ObjectKey); err != nil {
		s.mu.Unlock()
		return nil, err
	}
	prefix := session.S3PrefixFilter
	s.mu.Unlock()

	job := models.JobStatus{
		JobID:   fmt.Sprintf("job-%d", s.now().UnixNano()),
		Label:   "S3 Upload",
		Status:  "queued",
		Message: fmt.Sprintf("Uploading %s to s3://%s/%s.", request.SourcePath, bucketName, request.ObjectKey),
	}
	go s.runS3Upload(job, notifier, snapshot, session, profile, bucketName, request.ObjectKey, request.SourcePath, prefix)
	return job, nil
}

func (s *Service) handleAwsS3PresignObject(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
	var request struct {
		DurationSeconds int `json:"durationSeconds"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	snapshot, err := s.discovery.Discover()
	if err != nil {
		return nil, err
	}
	s.mu.Lock()
	session, err := s.currentState(ctx, snapshot)
	if err != nil {
		s.mu.Unlock()
		return nil, err
	}
	profile, bucketName, err := s.activeS3Selection(snapshot, session, true)
	if err != nil {
		s.mu.Unlock()
		return nil, err
	}
	request.DurationSeconds = clampPresignDuration(request.DurationSeconds)
	objectKey := session.SelectedS3ObjectKey
	if objectKey == "" {
		objectKey = s.selectedS3ObjectKey(session, s.s3Objects(ctx, profile, bucketName, session.S3PrefixFilter))
	}
	if objectKey == "" {
		s.mu.Unlock()
		return nil, errors.New("select an S3 object before generating a signed URL")
	}
	s.mu.Unlock()

	job := models.JobStatus{
		JobID:   fmt.Sprintf("job-%d", s.now().UnixNano()),
		Label:   "S3 Signed URL",
		Status:  "queued",
		Message: fmt.Sprintf("Generating a signed URL for %s.", objectKey),
	}
	go s.runS3Presign(job, notifier, profile, bucketName, objectKey, request.DurationSeconds)
	return job, nil
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

func (s *Service) handleAwsS3ValidateUrl(params json.RawMessage, notifier Notifier) (any, error) {
	var request struct {
		URL string `json:"url"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	if strings.TrimSpace(request.URL) == "" {
		return nil, errors.New("URL is required")
	}
	job := models.JobStatus{
		JobID:   fmt.Sprintf("job-%d", s.now().UnixNano()),
		Label:   "S3 URL Validation",
		Status:  "queued",
		Message: "Validating the pasted URL.",
	}
	go s.runURLValidation(job, notifier, request.URL)
	return job, nil
}

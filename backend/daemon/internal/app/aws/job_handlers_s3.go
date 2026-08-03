// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package aws

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"cloudsprocket/backend/daemon/internal/app/sessionport"
	"cloudsprocket/backend/daemon/internal/discovery"
	"cloudsprocket/backend/daemon/internal/models"
	"cloudsprocket/backend/daemon/internal/urlinspector"
)

// HandleS3LoadMoreObjects implements aws.s3.loadMoreObjects (synchronous page).
func (s *Service) HandleS3LoadMoreObjects(ctx context.Context, params json.RawMessage, _ sessionport.Notifier) (any, error) {
	if s == nil || s.s3 == nil || s.session == nil || s.workspace == nil {
		return nil, errors.New("aws write service is not available")
	}
	var request struct {
		ContinuationToken string `json:"continuationToken"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	token := strings.TrimSpace(request.ContinuationToken)
	if token == "" {
		return nil, errors.New("continuation token is required to load more objects")
	}
	snapshot, err := s.discovery.Discover()
	if err != nil {
		return nil, err
	}
	session, err := s.session.Load(ctx, snapshot)
	if err != nil {
		return nil, err
	}
	profile, err := LockedAWSProfile(snapshot.Profiles, session, "open an AWS workspace before listing S3 objects")
	if err != nil {
		return nil, err
	}
	bucket := strings.TrimSpace(session.SelectedS3BucketName)
	if bucket == "" {
		return nil, errors.New("select an S3 bucket before loading more objects")
	}

	actionCtx, cancel := s.WithActionTimeout(ctx)
	page, listErr := s.s3.ListObjects(actionCtx, profile, bucket, session.S3PrefixFilter, token)
	cancel()
	if listErr != nil {
		return nil, fmt.Errorf("could not load more S3 objects: %w", listErr)
	}

	workspace := s.workspace.Build(ctx, snapshot, session, sessionport.SnapshotOptions{
		AWSScope:           "s3",
		SkipAzureInventory: true,
		LightweightAWS:     true,
	})
	// Replace browser fields with the next page only; the UI appends to the list.
	workspace.S3Objects = page.Entries
	workspace.S3ObjectsNextToken = page.NextContinuationToken
	workspace.S3ObjectsHasMore = page.IsTruncated || page.NextContinuationToken != ""
	workspace.S3PrefixFilter = session.S3PrefixFilter
	workspace.SelectedS3BucketName = bucket
	moreNote := "End of list."
	if workspace.S3ObjectsHasMore {
		moreNote = "More results available."
	}
	workspace.S3StatusMessage = fmt.Sprintf("Loaded %d more item(s). %s", len(page.Entries), moreNote)
	return workspace, nil
}

// HandleS3UploadObject implements aws.s3.uploadObject (queues an async job).
func (s *Service) HandleS3UploadObject(ctx context.Context, params json.RawMessage, notifier sessionport.Notifier) (any, error) {
	if s == nil || s.s3 == nil || s.session == nil {
		return nil, errors.New("aws write service is not available")
	}
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
	session, err := s.session.Load(ctx, snapshot)
	if err != nil {
		return nil, err
	}
	profile, bucketName, err := ActiveS3Bucket(snapshot, session, true)
	if err != nil {
		return nil, err
	}
	if !WritesEnabled(session, profile) {
		return nil, errors.New("S3 uploads require write mode to be enabled")
	}
	if err := ValidateS3UploadRequest(request.SourcePath, request.ObjectKey); err != nil {
		return nil, err
	}
	prefix := session.S3PrefixFilter

	job := models.JobStatus{
		JobID:   s.newJobID(),
		Label:   "S3 Upload",
		Status:  "queued",
		Message: fmt.Sprintf("Uploading %s to s3://%s/%s.", request.SourcePath, bucketName, request.ObjectKey),
	}
	go s.RunS3Upload(job, notifier, snapshot, session, profile, bucketName, request.ObjectKey, request.SourcePath, prefix)
	return job, nil
}

// RunS3Upload performs the async S3 upload job body.
func (s *Service) RunS3Upload(
	job models.JobStatus,
	notifier sessionport.Notifier,
	snapshot discovery.Snapshot,
	session models.SessionSnapshot,
	profile models.ProfileSummary,
	bucketName string,
	objectKey string,
	sourcePath string,
	prefix string,
) {
	background := context.Background()
	s.notifyJob(notifier, models.JobStatus{
		JobID:   job.JobID,
		Label:   job.Label,
		Status:  "running",
		Message: fmt.Sprintf("Uploading %s to s3://%s/%s.", sourcePath, bucketName, objectKey),
	})

	result, err := s.s3.UploadFile(background, profile, bucketName, objectKey, sourcePath)
	if err != nil {
		s.notifyJob(notifier, models.JobStatus{
			JobID:   job.JobID,
			Label:   job.Label,
			Status:  "failed",
			Message: fmt.Sprintf("S3 upload failed: %v", err),
		})
		return
	}

	if s.invalidator != nil {
		s.invalidator.InvalidateResourceCache(background, "aws.s3.objects", profile.ProfileID+"|"+bucketName+"|"+prefix)
		s.invalidator.InvalidateResourceCache(background, "aws.s3.object-metadata", profile.ProfileID+"|"+bucketName+"|"+objectKey)
	}

	if prefix == "" || strings.HasPrefix(objectKey, prefix) {
		updated, saveErr := s.session.Update(background, snapshot, func(sess *models.SessionSnapshot) error {
			sess.SelectedS3ObjectKey = objectKey
			return nil
		})
		if saveErr != nil {
			s.notifyJob(notifier, models.JobStatus{
				JobID:   job.JobID,
				Label:   job.Label,
				Status:  "failed",
				Message: fmt.Sprintf("S3 upload completed, but session state could not be saved: %v", saveErr),
			})
			return
		}
		session = updated
	}

	if s.activity != nil {
		if err := s.activity.NotifyStateAndLog(
			background,
			snapshot,
			session,
			notifier,
			"success",
			fmt.Sprintf("Uploaded %s to %s.", objectKey, result.DestinationURI),
		); err != nil {
			s.notifyJob(notifier, models.JobStatus{
				JobID:   job.JobID,
				Label:   job.Label,
				Status:  "failed",
				Message: err.Error(),
			})
			return
		}
	}

	message := fmt.Sprintf("Uploaded %s to %s.", objectKey, result.DestinationURI)
	if prefix != "" && !strings.HasPrefix(objectKey, prefix) {
		message += " The current prefix filter hides the uploaded object."
	}
	s.notifyJob(notifier, models.JobStatus{
		JobID:       job.JobID,
		Label:       job.Label,
		Status:      "completed",
		Message:     message,
		CompletedAt: s.jobTimestamp(),
		Result:      result,
	})
}

// HandleS3PresignObject implements aws.s3.presignObject (queues an async job).
func (s *Service) HandleS3PresignObject(ctx context.Context, params json.RawMessage, notifier sessionport.Notifier) (any, error) {
	if s == nil || s.s3 == nil || s.session == nil {
		return nil, errors.New("aws write service is not available")
	}
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
	session, err := s.session.Load(ctx, snapshot)
	if err != nil {
		return nil, err
	}
	profile, bucketName, objectKey, err := ActiveS3ObjectSelection(snapshot, session, "")
	if err != nil {
		return nil, err
	}
	durationSeconds := ClampPresignDuration(request.DurationSeconds)

	job := models.JobStatus{
		JobID:   s.newJobID(),
		Label:   "S3 Signed URL",
		Status:  "queued",
		Message: fmt.Sprintf("Generating a signed URL for %s.", objectKey),
	}
	go s.RunS3Presign(job, notifier, profile, bucketName, objectKey, durationSeconds)
	return job, nil
}

// RunS3Presign performs the async S3 presign job body.
func (s *Service) RunS3Presign(
	job models.JobStatus,
	notifier sessionport.Notifier,
	profile models.ProfileSummary,
	bucketName string,
	objectKey string,
	durationSeconds int,
) {
	background := context.Background()
	s.notifyJob(notifier, models.JobStatus{
		JobID:   job.JobID,
		Label:   job.Label,
		Status:  "running",
		Message: fmt.Sprintf("Generating a signed URL for %s.", objectKey),
	})

	result, err := s.s3.PresignGetObject(background, profile, bucketName, objectKey, durationSeconds)
	if err != nil {
		s.notifyJob(notifier, models.JobStatus{
			JobID:   job.JobID,
			Label:   job.Label,
			Status:  "failed",
			Message: fmt.Sprintf("Signed URL generation failed: %v", err),
		})
		return
	}

	s.notifyJob(notifier, models.JobStatus{
		JobID:       job.JobID,
		Label:       job.Label,
		Status:      "completed",
		Message:     fmt.Sprintf("Generated a signed URL for %s.", objectKey),
		CompletedAt: s.jobTimestamp(),
		Result:      result,
	})
}

// HandleS3ValidateUrl implements aws.s3.validateUrl (queues an async job).
func (s *Service) HandleS3ValidateUrl(params json.RawMessage, notifier sessionport.Notifier) (any, error) {
	if s == nil {
		return nil, errors.New("aws write service is not available")
	}
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
		JobID:   s.newJobID(),
		Label:   "S3 URL Validation",
		Status:  "queued",
		Message: "Validating the pasted URL.",
	}
	go s.RunURLValidation(job, notifier, request.URL)
	return job, nil
}

// RunURLValidation performs the async URL validation job body.
func (s *Service) RunURLValidation(job models.JobStatus, notifier sessionport.Notifier, rawURL string) {
	s.notifyJob(notifier, models.JobStatus{
		JobID:   job.JobID,
		Label:   job.Label,
		Status:  "running",
		Message: "Validating the pasted URL.",
	})

	result := urlinspector.ValidateURL(nil, rawURL)
	status := "completed"
	if !result.Succeeded {
		status = "failed"
	}
	s.notifyJob(notifier, models.JobStatus{
		JobID:       job.JobID,
		Label:       job.Label,
		Status:      status,
		Message:     result.Summary,
		CompletedAt: s.jobTimestamp(),
		Result:      result,
	})
}

// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package app

import (
	"context"
	"fmt"
	"strings"

	"cloudsprocket/backend/daemon/internal/discovery"
	"cloudsprocket/backend/daemon/internal/models"
	"cloudsprocket/backend/daemon/internal/urlinspector"
)

func (s *Service) runRefresh(job models.JobStatus, notifier Notifier) {
	background := context.Background()
	if notifier != nil {
		_ = notifier.Notify("job.updated", models.JobStatus{
			JobID:   job.JobID,
			Label:   job.Label,
			Status:  "running",
			Message: "Refreshing provider discovery.",
		})
	}

	s.discovery.Invalidate()
	s.invalidateCloudResourceCaches(background)

	snapshot, err := s.discovery.Discover()
	if err != nil {
		if notifier != nil {
			_ = notifier.Notify("job.updated", models.JobStatus{
				JobID:   job.JobID,
				Label:   job.Label,
				Status:  "failed",
				Message: err.Error(),
			})
		}
		return
	}

	s.mu.Lock()
	session, err := s.currentState(background, snapshot)
	s.mu.Unlock()
	if err != nil {
		if notifier != nil {
			_ = notifier.Notify("job.updated", models.JobStatus{
				JobID:   job.JobID,
				Label:   job.Label,
				Status:  "failed",
				Message: err.Error(),
			})
		}
		return
	}

	s.mu.Lock()
	err = s.notifyStateAndLog(background, snapshot, session, notifier, "success", "Discovery refresh completed.")
	s.mu.Unlock()
	if err != nil {
		if notifier != nil {
			_ = notifier.Notify("job.updated", models.JobStatus{
				JobID:   job.JobID,
				Label:   job.Label,
				Status:  "failed",
				Message: err.Error(),
			})
		}
		return
	}

	opts := workspaceSnapshotOptions{
		lightweightAzure: true,
		lightweightAWS:   true,
	}
	if session.CurrentProviderID == "azure" {
		opts.azureDeferredInventory = true
	}
	workspace := s.buildWorkspaceSnapshotOpts(snapshot, session, opts)

	if notifier != nil {
		_ = notifier.Notify("job.updated", models.JobStatus{
			JobID:       job.JobID,
			Label:       job.Label,
			Status:      "completed",
			Message:     "Refresh completed.",
			CompletedAt: s.timestamp(),
			Result:      workspace,
		})
	}
}

func (s *Service) runS3Upload(
	job models.JobStatus,
	notifier Notifier,
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

	s.invalidateResourceCache(background, "aws.s3.objects", profile.ProfileID+"|"+bucketName+"|"+prefix)
	s.invalidateResourceCache(background, "aws.s3.object-metadata", profile.ProfileID+"|"+bucketName+"|"+objectKey)

	s.mu.Lock()
	if prefix == "" || strings.HasPrefix(objectKey, prefix) {
		session.SelectedS3ObjectKey = objectKey
	}
	if saveErr := s.store.SaveSession(background, session); saveErr != nil {
		s.mu.Unlock()
		s.notifyJob(notifier, models.JobStatus{
			JobID:   job.JobID,
			Label:   job.Label,
			Status:  "failed",
			Message: fmt.Sprintf("S3 upload completed, but session state could not be saved: %v", saveErr),
		})
		return
	}
	err = s.notifyStateAndLog(
		background,
		snapshot,
		session,
		notifier,
		"success",
		fmt.Sprintf("Uploaded %s to %s.", objectKey, result.DestinationURI),
	)
	s.mu.Unlock()
	if err != nil {
		s.notifyJob(notifier, models.JobStatus{
			JobID:   job.JobID,
			Label:   job.Label,
			Status:  "failed",
			Message: err.Error(),
		})
		return
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
		CompletedAt: s.timestamp(),
		Result:      result,
	})
}

func (s *Service) runS3Presign(
	job models.JobStatus,
	notifier Notifier,
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
		CompletedAt: s.timestamp(),
		Result:      result,
	})
}

func (s *Service) runURLValidation(job models.JobStatus, notifier Notifier, rawURL string) {
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
		CompletedAt: s.timestamp(),
		Result:      result,
	})
}

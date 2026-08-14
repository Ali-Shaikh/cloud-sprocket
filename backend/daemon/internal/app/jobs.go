// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package app

import (
	"context"

	"cloudsprocket/backend/daemon/internal/models"
)

func (s *Service) runRefresh(job models.JobStatus, notifier Notifier) {
	background := context.Background()
	if notifier != nil {
		_ = notifier.Notify("job.updated", models.JobStatus{
			JobID:   job.JobID,
			Label:   job.Label,
			Kind:    job.Kind,
			Status:  "running",
			Message: "Refreshing provider discovery.",
		})
	}

	s.discovery.Invalidate()
	// Explicit invalidation through sessionport.Invalidator (F-029 Phase 3).
	s.InvalidateRuntimeStatus()
	s.InvalidateAzureCLIExtensionCache()
	s.InvalidateCloudResourceCaches(background)

	snapshot, err := s.discovery.Discover()
	if err != nil {
		if notifier != nil {
			_ = notifier.Notify("job.updated", models.JobStatus{
				JobID:   job.JobID,
				Label:   job.Label,
				Kind:    job.Kind,
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
				Kind:    job.Kind,
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
				Kind:    job.Kind,
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
		opts.skipAwsInventory = true
	}
	if session.CurrentProviderID == "aws" {
		opts.awsDeferredInventory = true
		opts.skipAzureInventory = true
	}
	workspace := s.buildWorkspaceSnapshotOpts(background, snapshot, session, opts)

	if notifier != nil {
		_ = notifier.Notify("job.updated", models.JobStatus{
			JobID:       job.JobID,
			Label:       job.Label,
			Kind:        job.Kind,
			Status:      "completed",
			Message:     "Refresh completed.",
			CompletedAt: s.timestamp(),
			Result:      workspace,
		})
	}
}

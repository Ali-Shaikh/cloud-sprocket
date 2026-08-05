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

	"cloudsprocket/backend/daemon/internal/models"
)

func (s *Service) gcpComputeInstancesResult(
	ctx context.Context,
	profile models.ProfileSummary,
) ([]models.GcpComputeInstance, error) {
	if s.gcpCompute == nil {
		return []models.GcpComputeInstance{}, nil
	}
	const scope = "gcp.compute.instances"
	queryHash := profile.ProfileID

	if s.store != nil {
		var cached []models.GcpComputeInstance
		if fetchedAt, ok, _ := s.loadCachedResource(ctx, scope, queryHash, &cached); ok {
			for index := range cached {
				if cached[index].Summary == "" {
					cached[index].Summary = "Cached " + fetchedAt
				}
			}
			return cached, nil
		}
	}

	instances, err := s.gcpCompute.ListInstances(ctx, profile)
	if err == nil {
		if s.store != nil {
			fetchedAt := s.timestamp()
			if saveErr := s.saveResourceCacheWithTTL(ctx, scope, queryHash, instances); saveErr == nil {
				for index := range instances {
					if instances[index].Summary == "" {
						instances[index].Summary = "Fetched " + fetchedAt
					}
				}
			}
		}
		return instances, nil
	}

	if s.store != nil {
		var cached []models.GcpComputeInstance
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

	return []models.GcpComputeInstance{}, err
}

func (s *Service) selectedGcpComputeInstance(
	session models.SessionSnapshot,
	instances []models.GcpComputeInstance,
) string {
	selected := strings.TrimSpace(session.SelectedGcpComputeInstance)
	if selected == "" {
		return ""
	}
	for _, instance := range instances {
		if instance.Name == selected {
			return selected
		}
	}
	return ""
}

func (s *Service) enrichGcpComputeInventory(
	workspace *models.WorkspaceSnapshot,
	session models.SessionSnapshot,
	mu *sync.Mutex,
) {
	if workspace.Provider == nil ||
		workspace.Provider.ProviderID != "gcp" ||
		workspace.Profile == nil ||
		s.gcpCompute == nil {
		return
	}
	if !s.isServiceEnabled("gcp", "gcp-compute") {
		return
	}

	ctx, cancel := s.withAzureTimeout(context.Background())
	defer cancel()
	profile := *workspace.Profile

	instances, listErr := s.gcpComputeInstancesResult(ctx, profile)
	selected := s.selectedGcpComputeInstance(session, instances)

	var status string
	switch {
	case listErr != nil && len(instances) == 0:
		status = fmt.Sprintf(
			"Could not list Compute Engine instances.\nCheck that gcloud is installed, authenticated, and the active configuration has a project.\nDetail: %v",
			listErr,
		)
	case len(instances) == 0:
		status = "No Compute Engine instances are currently available for this GCP project."
	default:
		status = fmt.Sprintf(
			"Loaded %d Compute Engine instance(s) via gcloud. Enable write mode to start or stop instances.",
			len(instances),
		)
	}

	lockWorkspace(mu, func() {
		workspace.GcpComputeInstances = instances
		workspace.SelectedGcpComputeInstance = selected
		workspace.GcpComputeStatusMessage = status
	})
}

func (s *Service) handleGcpComputeStartInstance(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
	return s.handleGcpComputeLifecycle(ctx, params, notifier, "start")
}

func (s *Service) handleGcpComputeStopInstance(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
	return s.handleGcpComputeLifecycle(ctx, params, notifier, "stop")
}

func (s *Service) handleGcpComputeLifecycle(
	ctx context.Context,
	params json.RawMessage,
	notifier Notifier,
	action string,
) (any, error) {
	var request struct {
		InstanceName string `json:"instanceName"`
		Zone         string `json:"zone"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	name := strings.TrimSpace(request.InstanceName)
	zone := strings.TrimSpace(request.Zone)
	if name == "" {
		return nil, errors.New("instance name is required")
	}
	if zone == "" {
		return nil, errors.New("zone is required")
	}
	if s.gcpCompute == nil {
		return nil, errors.New("GCP Compute Engine inventory is not available")
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
	if !session.IsLocked || session.CurrentProviderID != "gcp" {
		s.mu.Unlock()
		return nil, errors.New("open a locked GCP workspace before changing Compute Engine instance state")
	}
	profile, ok := findProfile(filterProfiles(snapshot.Profiles, session.CurrentProviderID), session.SelectedProfileID)
	if !ok {
		s.mu.Unlock()
		return nil, errors.New("the workspace's GCP profile is not available")
	}
	if !effectiveGcpWritesEnabled(session, profile) {
		s.mu.Unlock()
		return nil, errors.New("Compute Engine lifecycle actions require write mode to be enabled for this GCP workspace")
	}
	s.mu.Unlock()

	timeoutCtx, cancel := s.withAzureTimeout(ctx)
	var lifecycleErr error
	switch action {
	case "start":
		lifecycleErr = s.gcpCompute.StartInstance(timeoutCtx, profile, name, zone)
	case "stop":
		lifecycleErr = s.gcpCompute.StopInstance(timeoutCtx, profile, name, zone)
	default:
		cancel()
		return nil, fmt.Errorf("unsupported Compute Engine action %q", action)
	}
	cancel()
	if lifecycleErr != nil {
		return nil, lifecycleErr
	}
	s.invalidateResourceCacheScope(ctx, "gcp.compute.instances")
	s.mu.Lock()
	session, err = s.currentState(ctx, snapshot)
	if err != nil {
		s.mu.Unlock()
		return nil, err
	}
	session.SelectedGcpComputeInstance = name
	if err := s.store.SaveSession(ctx, session); err != nil {
		s.mu.Unlock()
		return nil, err
	}
	s.mu.Unlock()
	verb := "Started"
	if action == "stop" {
		verb = "Stopped"
	}
	return s.finishGcpWorkspace(
		ctx,
		snapshot,
		session,
		notifier,
		"success",
		fmt.Sprintf("%s Compute Engine instance %s in zone %s.", verb, name, zone),
	)
}

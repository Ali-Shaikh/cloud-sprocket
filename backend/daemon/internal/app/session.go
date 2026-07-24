// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package app

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"cloudsprocket/backend/daemon/internal/discovery"
	"cloudsprocket/backend/daemon/internal/models"
)

func (s *Service) currentState(ctx context.Context, snapshot discovery.Snapshot) (models.SessionSnapshot, error) {
	stored, ok, err := s.store.LoadSession(ctx)
	if err != nil {
		return models.SessionSnapshot{}, err
	}
	if !ok {
		stored = models.SessionSnapshot{}
	}

	session := s.reconcileSession(stored, snapshot)
	if err := s.store.SaveSession(ctx, session); err != nil {
		return models.SessionSnapshot{}, err
	}
	return session, nil
}

func (s *Service) resetAppData(ctx context.Context, notifier Notifier) (models.AppResetResult, error) {
	s.mu.Lock()
	if err := s.store.ResetAppData(ctx); err != nil {
		s.mu.Unlock()
		return models.AppResetResult{}, err
	}
	session := models.SessionSnapshot{}
	if err := s.store.SaveSession(ctx, session); err != nil {
		s.mu.Unlock()
		return models.AppResetResult{}, err
	}
	if err := s.resetServicePreferencesLocked(); err != nil {
		s.mu.Unlock()
		return models.AppResetResult{}, err
	}
	s.mu.Unlock()

	resetPaths := []string{}
	skippedPaths := []string{}
	for _, target := range []struct {
		path         string
		expectedName string
	}{
		{path: s.settings.LocalConfigDir, expectedName: "local-config"},
		{path: s.settings.EmulatorStateDir, expectedName: "emulators"},
	} {
		resetPath, skipped, err := managedDirectoryTarget(s.settings.ConfigDir, target.path, target.expectedName)
		if err != nil {
			return models.AppResetResult{}, err
		}
		if resetPath != "" {
			resetPaths = append(resetPaths, resetPath)
			go func(path string) {
				_ = resetManagedDirectoryPath(path)
			}(resetPath)
		}
		if skipped != "" {
			skippedPaths = append(skippedPaths, skipped)
		}
	}

	if notifier != nil {
		if err := notifier.Notify("state.changed", statePayload(discovery.Snapshot{}, session)); err != nil {
			return models.AppResetResult{}, err
		}
	}

	return models.AppResetResult{
		Summary:      "CloudSprocket app state has been reset. External AWS, Azure, and GCP config files were not touched.",
		ResetPaths:   resetPaths,
		SkippedPaths: skippedPaths,
	}, nil
}

func (s *Service) timestamp() string {
	return s.now().UTC().Format(time.RFC3339)
}

func (s *Service) settingsSnapshot() models.AppSettingsSnapshot {
	return models.AppSettingsSnapshot{
		PlatformName:     s.settings.PlatformName,
		ConfigDir:        s.settings.ConfigDir,
		DatabasePath:     s.settings.DatabasePath,
		LogPath:          s.settings.LogPath,
		RuntimeMode:      runtimeModeFromSettings(s.settings.RuntimeMode),
		LocalConfigDir:   s.settings.LocalConfigDir,
		EmulatorStateDir: s.settings.EmulatorStateDir,
		LocalStackImage:  s.settings.LocalStackImage,
		FlociAZImage:     s.settings.FlociAZImage,
	}
}

func (s *Service) notifyStateAndLog(
	ctx context.Context,
	snapshot discovery.Snapshot,
	session models.SessionSnapshot,
	notifier Notifier,
	level string,
	message string,
) error {
	entry, err := s.store.AppendLog(ctx, level, message, "", s.timestamp())
	if err != nil {
		return err
	}

	if notifier != nil {
		if err := notifier.Notify("state.changed", statePayload(snapshot, session)); err != nil {
			return err
		}
		if err := notifier.Notify("log.appended", entry); err != nil {
			return err
		}
	}

	return nil
}

func (s *Service) notifyJob(notifier Notifier, job models.JobStatus) {
	if notifier != nil {
		_ = notifier.Notify("job.updated", job)
	}
}

func (s *Service) appendActivity(ctx context.Context, notifier Notifier, level string, message string) error {
	entry, err := s.store.AppendLog(ctx, level, message, "", s.timestamp())
	if err != nil {
		return err
	}
	if notifier != nil {
		if err := notifier.Notify("log.appended", entry); err != nil {
			return err
		}
	}
	return nil
}

func (s *Service) handleProvidersList() (any, error) {
	snapshot, err := s.discovery.Discover()
	if err != nil {
		return nil, err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	providers := make([]models.ProviderSummary, 0, len(snapshot.Providers))
	for _, provider := range snapshot.Providers {
		if s.isProviderEnabledLocked(provider.ProviderID) {
			providers = append(providers, provider)
		}
	}
	return providers, nil
}

func (s *Service) handleProfilesList(params json.RawMessage) (any, error) {
	var request struct {
		ProviderID string `json:"providerId"`
	}
	_ = json.Unmarshal(params, &request)
	snapshot, err := s.discovery.Discover()
	if err != nil {
		return nil, err
	}
	return filterProfiles(snapshot.Profiles, request.ProviderID), nil
}

func (s *Service) handleSessionGet(ctx context.Context, notifier Notifier) (any, error) {
	snapshot, err := s.discovery.Discover()
	if err != nil {
		return nil, err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	session, err := s.currentState(ctx, snapshot)
	return session, err
}

func (s *Service) handleWorkspaceGet(ctx context.Context, notifier Notifier) (any, error) {
	snapshot, err := s.discovery.Discover()
	if err != nil {
		return nil, err
	}
	// Hold the service mutex only while reading/reconciling the stored
	// session. buildWorkspaceSnapshot performs slow external probes (Docker,
	// AWS) that must not block other requests such as session.unlock, which
	// the Local Runtime tab polls into contention every few seconds.
	s.mu.Lock()
	session, err := s.currentState(ctx, snapshot)
	s.mu.Unlock()
	if err != nil {
		return nil, err
	}
	opts := workspaceSnapshotOptions{lightweightAzure: true, lightweightAWS: true}
	if session.CurrentProviderID == "azure" {
		opts.azureDeferredInventory = true
		opts.skipAwsInventory = true
	}
	if session.CurrentProviderID == "aws" {
		opts.awsDeferredInventory = true
		opts.skipAzureInventory = true
	}
	return s.buildWorkspaceSnapshotOpts(snapshot, session, opts), nil
}

// errSessionLockedForSelect is returned when session.selectProvider or
// session.selectProfile is called while a workspace is locked.
//
// Policy (architecture F-011): only session.unlock closes a locked workspace.
// The desktop leave-workspace dialog confirms with the user, then calls unlock
// before select so UX is unchanged. Select must not clear IsLocked itself;
// otherwise any RPC client could drop a lock without that confirm step.
var errSessionLockedForSelect = errors.New("close the active workspace with session.unlock before changing provider or profile")

func (s *Service) handleSessionSelectProvider(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
	var request struct {
		ProviderID string `json:"providerId"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	snapshot, err := s.discovery.Discover()
	if err != nil {
		return nil, err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	session, err := s.currentState(ctx, snapshot)
	if err != nil {
		return nil, err
	}
	if session.IsLocked {
		return nil, errSessionLockedForSelect
	}
	// Selection while unlocked only; lock state is owned by session.lock /
	// session.unlock (reconcileSession clears locked fields when unlocked).
	session.CurrentProviderID = request.ProviderID
	session.SelectedProfileID = ""
	session.SelectedAuthMethod = ""
	session.SelectedAzureResourceGroup = ""
	session.SelectedAzureVMID = ""
	session.SelectedS3BucketName = ""
	session.SelectedS3ObjectKey = ""
	session.S3PrefixFilter = ""
	session.SelectedEC2Region = ""
	session.SelectedEC2InstanceID = ""
	session = s.reconcileSession(session, snapshot)
	if err := s.store.SaveSession(ctx, session); err != nil {
		return nil, err
	}
	return session, s.notifyStateAndLog(ctx, snapshot, session, notifier, "info", fmt.Sprintf("Selected provider %s.", request.ProviderID))
}

func (s *Service) handleSessionSelectProfile(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
	var request struct {
		ProviderID string `json:"providerId"`
		ProfileID  string `json:"profileId"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	snapshot, err := s.discovery.Discover()
	if err != nil {
		return nil, err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	session, err := s.currentState(ctx, snapshot)
	if err != nil {
		return nil, err
	}
	if session.IsLocked {
		return nil, errSessionLockedForSelect
	}
	session.CurrentProviderID = request.ProviderID
	session.SelectedProfileID = request.ProfileID
	session.SelectedAuthMethod = ""
	session.SelectedAzureResourceGroup = ""
	session.SelectedAzureVMID = ""
	session.SelectedS3BucketName = ""
	session.SelectedS3ObjectKey = ""
	session.S3PrefixFilter = ""
	session.SelectedEC2Region = ""
	session.SelectedEC2InstanceID = ""
	session = s.reconcileSession(session, snapshot)
	if err := s.store.SaveSession(ctx, session); err != nil {
		return nil, err
	}
	return session, s.notifyStateAndLog(ctx, snapshot, session, notifier, "info", fmt.Sprintf("Selected profile %s.", request.ProfileID))
}

func (s *Service) handleSessionSelectAuthMethod(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
	var request struct {
		AuthMethod models.AuthMethod `json:"authMethod"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	snapshot, err := s.discovery.Discover()
	if err != nil {
		return nil, err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	session, err := s.currentState(ctx, snapshot)
	if err != nil {
		return nil, err
	}
	if !authMethodAvailable(session.AvailableAuthMethods, request.AuthMethod) {
		return nil, fmt.Errorf("auth method %s is not available", request.AuthMethod)
	}
	session.SelectedAuthMethod = request.AuthMethod
	if err := s.store.SaveSession(ctx, session); err != nil {
		return nil, err
	}
	return session, s.notifyStateAndLog(ctx, snapshot, session, notifier, "info", fmt.Sprintf("Selected auth method %s.", request.AuthMethod))
}

func (s *Service) handleSessionLock(ctx context.Context, notifier Notifier) (any, error) {
	snapshot, err := s.discovery.Discover()
	if err != nil {
		return nil, err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	session, err := s.currentState(ctx, snapshot)
	if err != nil {
		return nil, err
	}
	if session.CurrentProviderID == "" || session.SelectedProfileID == "" || session.SelectedAuthMethod == "" {
		return nil, errors.New("select a provider, profile, and auth method before opening the workspace")
	}
	if !authMethodAvailable(session.AvailableAuthMethods, session.SelectedAuthMethod) {
		return nil, errors.New("the selected auth method is not available for the active profile")
	}
	session.IsLocked = true
	session.AWSWriteModeEnabled = false
	session.AzureWriteModeEnabled = false
	session.LockedProviderID = session.CurrentProviderID
	session.LockedProfileID = session.SelectedProfileID
	session.LockedAuthMethod = session.SelectedAuthMethod
	session = s.reconcileSession(session, snapshot)
	if err := s.store.SaveSession(ctx, session); err != nil {
		return nil, err
	}
	return session, s.notifyStateAndLog(ctx, snapshot, session, notifier, "success", fmt.Sprintf("Opened %s workspace for %s.", session.LockedProviderID, session.LockedProfileID))
}

func (s *Service) handleSessionSetWriteMode(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
	var request struct {
		Enabled bool `json:"enabled"`
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
	if !session.IsLocked {
		s.mu.Unlock()
		return nil, errors.New("open a locked workspace before changing write mode")
	}
	profiles := filterProfiles(snapshot.Profiles, session.CurrentProviderID)
	profile, ok := findProfile(profiles, session.SelectedProfileID)
	if !ok {
		s.mu.Unlock()
		return nil, errors.New("the locked profile is no longer available")
	}
	switch session.CurrentProviderID {
	case "aws":
		session.AWSWriteModeEnabled = request.Enabled
	case "azure":
		if request.Enabled && !profileAllowsAzureWrites(profile, s.azureProviderCommandPath(snapshot)) {
			s.mu.Unlock()
			return nil, errors.New("this Azure profile cannot enable write mode: use the floci-az local profile or sign in with the Azure CLI")
		}
		session.AzureWriteModeEnabled = request.Enabled
	default:
		s.mu.Unlock()
		return nil, errors.New("write mode is only available for locked AWS or Azure workspaces")
	}
	if err := s.store.SaveSession(ctx, session); err != nil {
		s.mu.Unlock()
		return nil, err
	}
	s.mu.Unlock()
	if notifier != nil {
		_ = notifier.Notify("state.changed", statePayload(snapshot, session))
		level := "info"
		message := "Write mode disabled for this workspace session."
		if request.Enabled {
			level = "warning"
			switch session.CurrentProviderID {
			case "azure":
				message = fmt.Sprintf(
					"Write mode enabled for %s (target: %s).",
					profile.DisplayName,
					azureWriteTargetSummary(profile, s.settings.FlociAZEndpoint),
				)
			default:
				if profileIsLocalAWSEndpoint(profile) {
					message = fmt.Sprintf(
						"Write mode enabled for %s (local target: %s).",
						profile.DisplayName,
						writeTargetSummary(profile),
					)
				} else {
					message = fmt.Sprintf(
						"Write mode enabled for %s (live AWS target: %s). Mutating actions will hit the real account.",
						profile.DisplayName,
						writeTargetSummary(profile),
					)
				}
			}
		}
		_ = notifier.Notify("log.appended", models.ActivityLogEntry{
			Level:     level,
			Message:   message,
			Timestamp: s.timestamp(),
		})
	}
	// Write mode only flips session flags. Returning the session avoids a full
	// workspace rebuild and cloud inventory round-trip while the dialog waits.
	return session, nil
}

// handleSessionUnlock is the only intentional path that clears IsLocked.
// Desktop "Switch connection" and the leave-workspace confirm flow call this
// before session.selectProvider/selectProfile (architecture F-011).
func (s *Service) handleSessionUnlock(ctx context.Context, notifier Notifier) (any, error) {
	snapshot, err := s.discovery.Discover()
	if err != nil {
		return nil, err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	session, ok, err := s.store.LoadSession(ctx)
	if err != nil {
		return nil, err
	}
	if !ok {
		session = models.SessionSnapshot{}
	}
	session.IsLocked = false
	session.WorkspaceTabs = []models.WorkspaceTab{}
	session = s.reconcileSession(session, snapshot)
	if err := s.store.SaveSession(ctx, session); err != nil {
		return nil, err
	}
	return session, s.notifyStateAndLog(ctx, snapshot, session, notifier, "info", "Closed the active workspace.")
}

func (s *Service) handleLogsList(ctx context.Context, params json.RawMessage) (any, error) {
	var request struct {
		Limit int `json:"limit"`
	}
	_ = json.Unmarshal(params, &request)
	return s.store.ListLogs(ctx, request.Limit)
}

func (s *Service) handleAppSettingsGet() (any, error) {
	return s.settingsSnapshot(), nil
}

func (s *Service) handleAppReset(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
	var request struct {
		Confirmation string `json:"confirmation"`
	}
	_ = json.Unmarshal(params, &request)
	if strings.TrimSpace(request.Confirmation) != "RESET" {
		return nil, errors.New("type RESET to confirm the app reset")
	}
	return s.resetAppData(ctx, notifier)
}

func (s *Service) handleActionsInvoke(params json.RawMessage, notifier Notifier) (any, error) {
	var request struct {
		ActionID string `json:"actionId"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	if request.ActionID != "refresh" {
		return nil, fmt.Errorf("action %s is not implemented yet", request.ActionID)
	}
	job := models.JobStatus{
		JobID:   fmt.Sprintf("job-%d", s.now().UnixNano()),
		Label:   "Refresh Discovery",
		Status:  "queued",
		Message: "Refreshing provider discovery and session state.",
	}
	go s.runRefresh(job, notifier)
	return job, nil
}

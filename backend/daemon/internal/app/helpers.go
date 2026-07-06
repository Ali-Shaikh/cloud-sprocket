// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package app

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"cloudsprocket/backend/daemon/internal/discovery"
	"cloudsprocket/backend/daemon/internal/models"
)

func filterProfiles(profiles []models.ProfileSummary, providerID string) []models.ProfileSummary {
	if providerID == "" {
		return append([]models.ProfileSummary(nil), profiles...)
	}

	filtered := []models.ProfileSummary{}
	for _, profile := range profiles {
		if profile.ProviderID == providerID {
			filtered = append(filtered, profile)
		}
	}
	return filtered
}

func findProfile(profiles []models.ProfileSummary, profileID string) (models.ProfileSummary, bool) {
	for _, profile := range profiles {
		if profile.ProfileID == profileID {
			return profile, true
		}
	}
	return models.ProfileSummary{}, false
}

func findProvider(providers []models.ProviderSummary, providerID string) (models.ProviderSummary, bool) {
	for _, provider := range providers {
		if provider.ProviderID == providerID {
			return provider, true
		}
	}
	return models.ProviderSummary{}, false
}

func providerExists(providers []models.ProviderSummary, providerID string) bool {
	for _, provider := range providers {
		if provider.ProviderID == providerID {
			return true
		}
	}
	return false
}

func profileExists(profiles []models.ProfileSummary, profileID string) bool {
	_, ok := findProfile(profiles, profileID)
	return ok
}

func authMethodAvailable(methods []models.AuthMethodStatus, target models.AuthMethod) bool {
	for _, method := range methods {
		if method.Method == target && method.Available {
			return true
		}
	}
	return false
}

func firstAvailableAuthMethod(methods []models.AuthMethodStatus) models.AuthMethod {
	for _, method := range methods {
		if method.Available {
			return method.Method
		}
	}
	return ""
}

func statePayload(snapshot discovery.Snapshot, session models.SessionSnapshot) models.StateChangedPayload {
	return models.StateChangedPayload{
		Providers: snapshot.Providers,
		Profiles:  filterProfiles(snapshot.Profiles, session.CurrentProviderID),
		Session:   session,
	}
}

func (s *Service) reconcileSession(session models.SessionSnapshot, snapshot discovery.Snapshot) models.SessionSnapshot {
	if session.IsLocked {
		session.CurrentProviderID = session.LockedProviderID
		session.SelectedProfileID = session.LockedProfileID
		session.SelectedAuthMethod = session.LockedAuthMethod
	}

	if session.CurrentProviderID == "" || !providerExists(snapshot.Providers, session.CurrentProviderID) {
		if len(snapshot.Providers) > 0 {
			session.CurrentProviderID = snapshot.Providers[0].ProviderID
		}
	}

	profiles := filterProfiles(snapshot.Profiles, session.CurrentProviderID)
	if len(profiles) == 0 {
		return clearLockState(session)
	}

	if session.SelectedProfileID == "" || !profileExists(profiles, session.SelectedProfileID) {
		session.SelectedProfileID = profiles[0].ProfileID
	}

	currentProfile, ok := findProfile(profiles, session.SelectedProfileID)
	if !ok {
		return clearLockState(session)
	}

	session.AvailableAuthMethods = append([]models.AuthMethodStatus(nil), currentProfile.AuthMethods...)
	if session.SelectedAuthMethod == "" || !authMethodAvailable(session.AvailableAuthMethods, session.SelectedAuthMethod) {
		session.SelectedAuthMethod = firstAvailableAuthMethod(session.AvailableAuthMethods)
	}

	if session.IsLocked {
		if session.LockedProviderID != session.CurrentProviderID || session.LockedProfileID != session.SelectedProfileID || session.LockedAuthMethod != session.SelectedAuthMethod {
			return clearLockState(session)
		}
		// Caller must hold s.mu (or otherwise exclude preference writes); do not
		// call s.workspaceTabs here because it acquires s.mu again.
		session.WorkspaceTabs = workspaceTabsForPreferences(session.LockedProviderID, s.preferences)
		return session
	}

	return clearLockState(session)
}

func clearLockState(session models.SessionSnapshot) models.SessionSnapshot {
	session.IsLocked = false
	session.LockedProviderID = ""
	session.LockedProfileID = ""
	session.LockedAuthMethod = ""
	session.SelectedAzureResourceGroup = ""
	session.SelectedAzureVMID = ""
	session.SelectedAzureStorageAccount = ""
	session.SelectedAzureBlobContainer = ""
	session.SelectedAzureBlobName = ""
	session.AzureBlobPrefixFilter = ""
	session.AzureWriteModeEnabled = false
	session.SelectedS3BucketName = ""
	session.SelectedS3ObjectKey = ""
	session.S3PrefixFilter = ""
	session.SelectedEC2Region = ""
	session.SelectedEC2InstanceID = ""
	session.SelectedLambdaRegion = ""
	session.SelectedLambdaFunctionName = ""
	session.SelectedDynamoDBRegion = ""
	session.SelectedDynamoDBTableName = ""
	session.SelectedSQSRegion = ""
	session.SelectedSQSQueueURL = ""
	session.SelectedSNSRegion = ""
	session.SelectedSNSTopicArn = ""
	session.SelectedRDSRegion = ""
	session.SelectedRDSInstanceID = ""
	session.SelectedLogsRegion = ""
	session.SelectedLogGroupName = ""
	session.SelectedIAMRoleName = ""
	session.AWSWriteModeEnabled = false
	session.AvailableAuthMethods = append([]models.AuthMethodStatus(nil), session.AvailableAuthMethods...)
	if session.SelectedProfileID == "" {
		session.SelectedAuthMethod = ""
		session.AvailableAuthMethods = []models.AuthMethodStatus{}
	}
	session.WorkspaceTabs = []models.WorkspaceTab{}
	return session
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return value
		}
	}
	return ""
}

func selectedEC2State(instances []models.AwsEc2Instance, instanceID string) string {
	for _, instance := range instances {
		if instance.InstanceID == instanceID {
			return instance.State
		}
	}
	return ""
}

func profileRegionHint(profile models.ProfileSummary) string {
	for _, field := range profile.Attributes {
		if field.Label == "Region" && field.Value != "" {
			return field.Value
		}
	}
	return "us-east-1"
}

func normaliseProfileFieldLabel(label string) string {
	replacer := strings.NewReplacer(" ", "", "_", "", "-", "")
	return strings.ToLower(replacer.Replace(label))
}

func normaliseEmulatorID(value string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return "localstack"
	}
	return value
}

func emulatorActionResult(action string, status models.LocalStackStatus) models.EmulatorActionResult {
	state := models.EmulatorActionSucceeded
	switch status.Status {
	case models.EmulatorStatusRunning, models.EmulatorStatusStopped:
		state = models.EmulatorActionSucceeded
	case models.EmulatorStatusUnhealthy:
		state = models.EmulatorActionDegraded
	case models.EmulatorStatusNotConfigured, models.EmulatorStatusUnknown:
		state = models.EmulatorActionFailed
	default:
		state = models.EmulatorActionDegraded
	}

	summary := status.Summary
	if summary == "" {
		switch action {
		case "prepareProfile":
			summary = "LocalStack managed profile is prepared."
		case "start":
			summary = "LocalStack start request completed."
		case "stop":
			summary = "LocalStack stop request completed."
		}
	}
	return models.EmulatorActionResult{
		EmulatorID: status.EmulatorID,
		Action:     action,
		State:      state,
		Summary:    summary,
		Status:     status,
	}
}

func newLocalConfigArtifact(id string, providerID string, label string, path string, pendingSummary string) models.LocalConfigArtifact {
	status := "not-created"
	summary := pendingSummary
	if strings.TrimSpace(path) != "" {
		if _, err := os.Stat(path); err == nil {
			status = "available"
			summary = "Managed local configuration artefact is present."
		}
	}
	return models.LocalConfigArtifact{
		ArtifactID: id,
		ProviderID: providerID,
		Label:      label,
		Path:       path,
		Status:     status,
		Managed:    true,
		Summary:    summary,
	}
}

func pathStatus(path string, directory bool) string {
	if strings.TrimSpace(path) == "" {
		return "Not configured"
	}
	info, err := os.Stat(path)
	if err != nil {
		if os.IsNotExist(err) {
			return path + " (missing)"
		}
		return path + " (" + err.Error() + ")"
	}
	if directory && !info.IsDir() {
		return path + " (not a directory)"
	}
	if !directory && info.IsDir() {
		return path + " (directory)"
	}
	return path + " (available)"
}

func writePolicySummary(profile models.ProfileSummary) string {
	if isLocalFlociProfile(profile) {
		return "Writes enabled for floci-az local profile"
	}
	if profileIsLocalAWSEndpoint(profile) {
		return "Local endpoint profile. Enable write mode from the top bar for mutating actions."
	}
	return "Live AWS profile. Enable write mode from the top bar; mutations hit the real account."
}

func writeTargetSummary(profile models.ProfileSummary) string {
	if endpoint := profileEndpointURL(profile); endpoint != "" {
		return endpoint
	}
	return "default AWS endpoint"
}

func clampPresignDuration(durationSeconds int) int {
	if durationSeconds <= 0 {
		return 900
	}
	// AWS SigV4 presigned URLs are valid for at most 7 days.
	const maxPresignSeconds = 7 * 24 * 60 * 60
	if durationSeconds > maxPresignSeconds {
		return maxPresignSeconds
	}
	return durationSeconds
}

func resetManagedDirectory(configRoot string, targetPath string, expectedName string) (string, string, error) {
	target, skipped, err := managedDirectoryTarget(configRoot, targetPath, expectedName)
	if err != nil || target == "" {
		return target, skipped, err
	}
	if err := resetManagedDirectoryPath(target); err != nil {
		return "", "", err
	}
	return target, "", nil
}

func managedDirectoryTarget(configRoot string, targetPath string, expectedName string) (string, string, error) {
	if strings.TrimSpace(configRoot) == "" || strings.TrimSpace(targetPath) == "" {
		return "", targetPath, nil
	}

	root, err := filepath.Abs(configRoot)
	if err != nil {
		return "", targetPath, err
	}
	target, err := filepath.Abs(targetPath)
	if err != nil {
		return "", targetPath, err
	}
	if filepath.Base(target) != expectedName {
		return "", target, nil
	}
	rel, err := filepath.Rel(root, target)
	if err != nil {
		return "", target, err
	}
	if rel == "." || strings.HasPrefix(rel, ".."+string(os.PathSeparator)) || rel == ".." || filepath.IsAbs(rel) {
		return "", target, nil
	}

	return target, "", nil
}

func resetManagedDirectoryPath(target string) error {
	if err := os.RemoveAll(target); err != nil {
		return err
	}
	if err := os.MkdirAll(target, 0o755); err != nil {
		return err
	}
	return nil
}

func upsertINISection(path string, header string, body string, perm os.FileMode) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	existing := ""
	if data, err := os.ReadFile(path); err == nil {
		existing = string(data)
	} else if !errors.Is(err, os.ErrNotExist) {
		return err
	}

	bodyLines := strings.Split(strings.TrimRight(body, "\n"), "\n")
	out := []string{}
	found := false
	inTarget := false
	for _, line := range strings.Split(existing, "\n") {
		trimmed := strings.TrimSpace(line)
		isHeader := strings.HasPrefix(trimmed, "[") && strings.HasSuffix(trimmed, "]")
		if isHeader {
			if trimmed == header {
				found = true
				inTarget = true
				out = append(out, header)
				out = append(out, bodyLines...)
				continue
			}
			inTarget = false
		}
		if inTarget {
			// Drop the previous body of the target section until the next header.
			continue
		}
		out = append(out, line)
	}
	if !found {
		for len(out) > 0 && strings.TrimSpace(out[len(out)-1]) == "" {
			out = out[:len(out)-1]
		}
		if len(out) > 0 {
			out = append(out, "")
		}
		out = append(out, header)
		out = append(out, bodyLines...)
	}
	content := strings.TrimRight(strings.Join(out, "\n"), "\n") + "\n"
	return os.WriteFile(path, []byte(content), perm)
}

// upsertAzureSubscription writes or replaces a subscription (matched by id) in
// the user's azureProfile.json while preserving the other subscriptions. A
// UTF-8 BOM (which the az CLI sometimes writes) is tolerated on read.

func upsertAzureSubscription(path string, id string, subscription map[string]any) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	profile := map[string]any{}
	if data, err := os.ReadFile(path); err == nil {
		text := strings.TrimPrefix(string(data), "\ufeff")
		if strings.TrimSpace(text) != "" {
			if err := json.Unmarshal([]byte(text), &profile); err != nil {
				return fmt.Errorf("failed to parse Azure profile: %w", err)
			}
		}
	} else if !errors.Is(err, os.ErrNotExist) {
		return err
	}

	subscriptions := []any{}
	if existing, ok := profile["subscriptions"].([]any); ok {
		subscriptions = existing
	}
	replaced := false
	for index, raw := range subscriptions {
		entry, ok := raw.(map[string]any)
		if !ok {
			continue
		}
		if existingID, ok := entry["id"].(string); ok && existingID == id {
			subscriptions[index] = subscription
			replaced = true
			break
		}
	}
	if !replaced {
		subscriptions = append(subscriptions, subscription)
	}
	profile["subscriptions"] = subscriptions

	encoded, err := json.MarshalIndent(profile, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, encoded, 0o644)
}

func ec2DesiredState(action string) string {
	switch action {
	case "start", "reboot":
		return "running"
	case "stop":
		return "stopped"
	default:
		return ""
	}
}

func runtimeModeFromSettings(value string) models.RuntimeMode {
	switch strings.TrimSpace(strings.ToLower(value)) {
	case string(models.RuntimeModeLocalEmulator):
		return models.RuntimeModeLocalEmulator
	default:
		return models.RuntimeModeCloud
	}
}

// dockerRuntimeSnapshot returns the Docker runtime state, serving a recent
// "unreachable" verdict from cache so polling does not repeatedly pay the probe
// timeout while the engine is stopped.

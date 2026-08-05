// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package labs

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"strings"

	"cloudsprocket/backend/daemon/internal/deploy"
	"cloudsprocket/backend/daemon/internal/discovery"
	"cloudsprocket/backend/daemon/internal/models"
	"cloudsprocket/backend/daemon/internal/recipes"
)

// FindLabStepSpec returns the step with the given id from a lab spec.
func FindLabStepSpec(labSpec *recipes.LabSpec, stepID string) (recipes.LabStep, bool) {
	if labSpec == nil {
		return recipes.LabStep{}, false
	}
	for _, step := range labSpec.Steps {
		if step.ID == stepID {
			return step, true
		}
	}
	return recipes.LabStep{}, false
}

// ResolveLabActionIndex picks a step action by index or by matching type payload.
func ResolveLabActionIndex(step recipes.LabStep, actionIndex *int, action json.RawMessage) (int, error) {
	if actionIndex != nil {
		if *actionIndex < 0 || *actionIndex >= len(step.Actions) {
			return 0, fmt.Errorf("lab action index %d is out of range", *actionIndex)
		}
		return *actionIndex, nil
	}
	if len(action) == 0 {
		return 0, errors.New("lab action index is required")
	}
	var payload struct {
		Type string `json:"type"`
		Tab  string `json:"tab"`
		Op   string `json:"op"`
	}
	if err := json.Unmarshal(action, &payload); err != nil {
		return 0, err
	}
	for index, candidate := range step.Actions {
		if strings.TrimSpace(candidate.Type) != strings.TrimSpace(payload.Type) {
			continue
		}
		switch strings.TrimSpace(candidate.Type) {
		case recipes.LabActionOpenTab:
			if strings.TrimSpace(candidate.Tab) == strings.TrimSpace(payload.Tab) {
				return index, nil
			}
		case recipes.LabActionInvokeWrite:
			if strings.TrimSpace(candidate.Op) == strings.TrimSpace(payload.Op) {
				return index, nil
			}
		default:
			return index, nil
		}
	}
	return 0, errors.New("lab action was not found in this step")
}

// DeploymentProfile resolves the connection profile for a deployment.
func DeploymentProfile(snapshot discovery.Snapshot, deployment *deploy.Deployment) (models.ProfileSummary, error) {
	if deployment == nil {
		return models.ProfileSummary{}, errors.New("deployment is required")
	}
	profiles := filterProfiles(snapshot.Profiles, deployment.ProviderID)
	if profileID := strings.TrimSpace(deployment.ProfileID); profileID != "" {
		profile, ok := findProfile(profiles, profileID)
		if !ok {
			return models.ProfileSummary{}, errors.New("the deployment profile is not available")
		}
		return profile, nil
	}
	if len(profiles) == 0 {
		return models.ProfileSummary{}, errors.New("no connection profile is available for this deployment")
	}
	return profiles[0], nil
}

// DeploymentAWSRegion returns the deployment's aws_region variable or the
// profile region hint.
func DeploymentAWSRegion(deployment *deploy.Deployment, profile models.ProfileSummary) string {
	if deployment != nil && deployment.Variables != nil {
		if region, ok := deployment.Variables["aws_region"]; ok {
			regionText := strings.TrimSpace(fmt.Sprint(region))
			if regionText != "" {
				return regionText
			}
		}
	}
	return profileRegionHint(profile)
}

// WritesEnabled reports whether AWS write mode is on for the session.
// Mirrors app/aws.WritesEnabled so labs does not import that domain package.
func WritesEnabled(session models.SessionSnapshot, _ models.ProfileSummary) bool {
	return session.IsLocked && session.AWSWriteModeEnabled
}

// DrainAndCloseHTTPBody consumes and closes an HTTP response body so keep-alive
// connections can be reused after health probes.
func DrainAndCloseHTTPBody(body io.ReadCloser) {
	if body == nil {
		return
	}
	defer body.Close()
	_, _ = io.Copy(io.Discard, body)
}

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

func profileRegionHint(profile models.ProfileSummary) string {
	for _, field := range profile.Attributes {
		if field.Label == "Region" && field.Value != "" {
			return field.Value
		}
	}
	return "us-east-1"
}

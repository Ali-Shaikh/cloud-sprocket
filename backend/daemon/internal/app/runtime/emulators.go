// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package runtime

import (
	"context"
	"errors"
	"fmt"
	"path/filepath"
	"strings"
	"time"

	"cloudsprocket/backend/daemon/internal/flociazcompat"
	"cloudsprocket/backend/daemon/internal/models"
)

const localAWSProfileName = "cloudsprocket-localstack"

func (s *Service) emulatorsList(ctx context.Context) []models.EmulatorSummary {
	summaries := []models.EmulatorSummary{}

	if s.localstack != nil {
		statusCtx, cancel := context.WithTimeout(ctx, DockerProbeTimeout)
		status, err := s.localstack.Status(statusCtx)
		cancel()
		if err == nil {
			summaries = append(summaries, models.EmulatorSummary{
				EmulatorID: status.EmulatorID,
				ProviderID: status.ProviderID,
				Label:      status.Label,
				Kind:       status.Kind,
				Status:     status.Status,
				Summary:    status.Summary,
				Details:    status.Details,
			})
		}
	}

	if s.azureRuntime != nil {
		statusCtx, cancel := context.WithTimeout(ctx, DockerProbeTimeout)
		status, err := s.azureRuntime.Status(statusCtx)
		cancel()
		if err == nil {
			summaries = append(summaries, models.EmulatorSummary{
				EmulatorID: status.EmulatorID,
				ProviderID: status.ProviderID,
				Label:      status.Label,
				Kind:       status.Kind,
				Status:     status.Status,
				Summary:    status.Summary,
				Details:    status.Details,
			})
		}
	}

	return summaries
}

// plannedEmulatorSummaries is the static fallback when Docker is unreachable so
// live per-emulator probes do not multiply the probe timeout cost.
func (s *Service) plannedEmulatorSummaries() []models.EmulatorSummary {
	awsDetails := []models.DetailField{
		{Label: "Image", Value: s.settings.LocalStackImage},
		{Label: "Managed Config Root", Value: filepath.Join(s.settings.LocalConfigDir, "aws")},
	}
	azureDetails := []models.DetailField{
		{Label: "Image", Value: s.settings.FlociAZImage},
		{Label: "Managed Config Root", Value: filepath.Join(s.settings.LocalConfigDir, "azure")},
	}

	return []models.EmulatorSummary{
		{
			EmulatorID: "localstack",
			ProviderID: "aws",
			Label:      "LocalStack",
			Kind:       "docker",
			Status:     models.EmulatorStatusNotConfigured,
			Summary:    "Managed AWS local runtime is planned but not configured yet.",
			Details:    awsDetails,
		},
		{
			EmulatorID: "floci-az",
			ProviderID: "azure",
			Label:      "floci-az",
			Kind:       "docker",
			Status:     models.EmulatorStatusNotConfigured,
			Summary:    "Managed Azure local runtime is planned but not configured yet.",
			Details:    azureDetails,
		},
	}
}

func (s *Service) emulatorsPrepareProfile(ctx context.Context, emulatorID string) (models.EmulatorActionResult, error) {
	emulatorID = normaliseEmulatorID(emulatorID)
	if emulatorID == "floci-az" {
		if s.azureRuntime == nil {
			return models.EmulatorActionResult{}, errors.New("floci-az manager not available")
		}
		if err := s.azureRuntime.EnsureManagedConfig(); err != nil {
			return models.EmulatorActionResult{}, fmt.Errorf("failed to prepare managed Azure config: %w", err)
		}
		if err := s.writeLocalAzureSubscription(); err != nil {
			return models.EmulatorActionResult{}, fmt.Errorf("failed to create local Azure profile: %w", err)
		}
		statusCtx, cancel := context.WithTimeout(ctx, DockerProbeTimeout)
		defer cancel()
		status, _ := s.azureRuntime.Status(statusCtx)
		status.ProfileName = flociazcompat.LocalProfileID
		status.ConfigPath = s.settings.AzureProfilePath()
		status.Endpoint = "http://localhost:4577"
		if strings.TrimSpace(status.Summary) == "" {
			status.Summary = fmt.Sprintf("Local Azure profile %q is ready in your Azure config. Open it from the Connect screen.", flociazcompat.LocalProfileID)
		}
		return emulatorActionResult("prepareProfile", status), nil
	}
	if s.localstack == nil {
		return models.EmulatorActionResult{}, errors.New("LocalStack manager not available")
	}

	if err := s.localstack.EnsureManagedProfile(); err != nil {
		return models.EmulatorActionResult{}, fmt.Errorf("failed to prepare managed profile: %w", err)
	}
	if err := s.writeLocalAWSProfile(); err != nil {
		return models.EmulatorActionResult{}, fmt.Errorf("failed to create local AWS profile: %w", err)
	}

	statusCtx, cancel := context.WithTimeout(ctx, DockerProbeTimeout)
	defer cancel()
	status, _ := s.localstack.Status(statusCtx)
	status.ProfileName = localAWSProfileName
	status.ConfigPath = s.settings.AWSConfigPath
	status.CredsPath = s.settings.AWSCredentialsPath
	status.Endpoint = "http://localhost:4566"
	if strings.TrimSpace(status.Summary) == "" {
		status.Summary = fmt.Sprintf("Local AWS profile %q is ready in your AWS config. Open it from the Connect screen.", localAWSProfileName)
	}
	return emulatorActionResult("prepareProfile", status), nil
}

func (s *Service) writeLocalAWSProfile() error {
	if strings.TrimSpace(s.settings.AWSConfigPath) == "" || strings.TrimSpace(s.settings.AWSCredentialsPath) == "" {
		return errors.New("AWS config paths are not configured")
	}
	configBody := "region = us-east-1\noutput = json\nendpoint_url = http://localhost:4566\ncloudsprocket_allow_writes = true\n"
	if err := upsertINISection(s.settings.AWSConfigPath, "[profile "+localAWSProfileName+"]", configBody, 0o644); err != nil {
		return err
	}
	credsBody := "aws_access_key_id = test\naws_secret_access_key = test\n"
	return upsertINISection(s.settings.AWSCredentialsPath, "["+localAWSProfileName+"]", credsBody, 0o600)
}

func (s *Service) writeLocalAzureSubscription() error {
	path := s.settings.AzureProfilePath()
	if strings.TrimSpace(path) == "" {
		return errors.New("Azure profile path is not configured")
	}
	subscription := map[string]any{
		"id":              flociazcompat.LocalProfileID,
		"name":            "CloudSprocket floci-az (local)",
		"state":           "Enabled",
		"isDefault":       false,
		"tenantId":        "cloudsprocket-local",
		"environmentName": "FlociAzLocal",
		"user": map[string]any{
			"name": "local@cloudsprocket",
			"type": "user",
		},
	}
	return upsertAzureSubscription(path, flociazcompat.LocalProfileID, subscription)
}

// StartEmulator starts LocalStack or floci-az and invalidates the status cache.
func (s *Service) StartEmulator(ctx context.Context, options models.EmulatorStartOptions) (models.EmulatorActionResult, error) {
	return s.emulatorsStart(ctx, options)
}

func (s *Service) emulatorsStart(ctx context.Context, options models.EmulatorStartOptions) (models.EmulatorActionResult, error) {
	emulatorID := normaliseEmulatorID(options.EmulatorID)
	if emulatorID == "floci-az" {
		if s.azureRuntime == nil {
			return models.EmulatorActionResult{}, errors.New("floci-az manager not available")
		}
		startTimeout := 20 * time.Second
		if options.Recreate {
			startTimeout = 90 * time.Second
		}
		actionCtx, cancel := context.WithTimeout(ctx, startTimeout)
		defer cancel()
		status, err := s.azureRuntime.Start(actionCtx, options)
		result := emulatorActionResult("start", status)
		if err != nil {
			return result, errors.New(result.Summary)
		}
		s.InvalidateStatus()
		return result, nil
	}
	if s.localstack == nil {
		return models.EmulatorActionResult{}, errors.New("LocalStack manager not available")
	}
	startTimeout := 20 * time.Second
	if options.Recreate {
		startTimeout = 90 * time.Second
	}
	actionCtx, cancel := context.WithTimeout(ctx, startTimeout)
	defer cancel()
	status, err := s.localstack.Start(actionCtx, options)
	result := emulatorActionResult("start", status)
	if err != nil {
		return result, errors.New(result.Summary)
	}
	s.InvalidateStatus()
	return result, nil
}

// StopEmulator stops LocalStack or floci-az and invalidates the status cache.
func (s *Service) StopEmulator(ctx context.Context, emulatorID string) (models.EmulatorActionResult, error) {
	return s.emulatorsStop(ctx, emulatorID)
}

func (s *Service) emulatorsStop(ctx context.Context, emulatorID string) (models.EmulatorActionResult, error) {
	emulatorID = normaliseEmulatorID(emulatorID)
	if emulatorID == "floci-az" {
		if s.azureRuntime == nil {
			return models.EmulatorActionResult{}, errors.New("floci-az manager not available")
		}
		actionCtx, cancel := context.WithTimeout(ctx, 20*time.Second)
		defer cancel()
		status, err := s.azureRuntime.Stop(actionCtx)
		result := emulatorActionResult("stop", status)
		if err != nil {
			return result, errors.New(result.Summary)
		}
		s.InvalidateStatus()
		return result, nil
	}
	if s.localstack == nil {
		return models.EmulatorActionResult{}, errors.New("LocalStack manager not available")
	}
	actionCtx, cancel := context.WithTimeout(ctx, 20*time.Second)
	defer cancel()
	status, err := s.localstack.Stop(actionCtx)
	result := emulatorActionResult("stop", status)
	if err != nil {
		return result, errors.New(result.Summary)
	}
	s.InvalidateStatus()
	return result, nil
}

func (s *Service) emulatorsLogs(ctx context.Context, emulatorID string, tail int) (models.EmulatorLogSnapshot, error) {
	emulatorID = normaliseEmulatorID(emulatorID)
	logsCtx, cancel := context.WithTimeout(ctx, DockerLogsTimeout)
	defer cancel()
	if emulatorID == "floci-az" {
		if s.azureRuntime == nil {
			return models.EmulatorLogSnapshot{}, errors.New("floci-az manager not available")
		}
		return s.azureRuntime.Logs(logsCtx, tail)
	}
	if s.localstack == nil {
		return models.EmulatorLogSnapshot{}, errors.New("LocalStack manager not available")
	}
	return s.localstack.Logs(logsCtx, tail)
}

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

	"cloudsprocket/backend/daemon/internal/flociazcompat"
	"cloudsprocket/backend/daemon/internal/models"
)

const localAWSProfileName = "cloudsprocket-localstack"

func (s *Service) emulatorsList() []models.EmulatorSummary {
	summaries := []models.EmulatorSummary{}

	if s.localstackMgr != nil {
		ctx, cancel := context.WithTimeout(context.Background(), dockerProbeTimeout)
		defer cancel()
		status, err := s.localstackMgr.Status(ctx)
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
		ctx, cancel := context.WithTimeout(context.Background(), dockerProbeTimeout)
		defer cancel()
		status, err := s.azureRuntime.Status(ctx)
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

func (s *Service) emulatorsPrepareProfile(emulatorID string) (models.EmulatorActionResult, error) {
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
		statusCtx, cancel := context.WithTimeout(context.Background(), dockerProbeTimeout)
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
	if s.localstackMgr == nil {
		return models.EmulatorActionResult{}, errors.New("LocalStack manager not available")
	}

	if err := s.localstackMgr.EnsureManagedProfile(); err != nil {
		return models.EmulatorActionResult{}, fmt.Errorf("failed to prepare managed profile: %w", err)
	}
	if err := s.writeLocalAWSProfile(); err != nil {
		return models.EmulatorActionResult{}, fmt.Errorf("failed to create local AWS profile: %w", err)
	}

	statusCtx, cancel := context.WithTimeout(context.Background(), dockerProbeTimeout)
	defer cancel()
	status, _ := s.localstackMgr.Status(statusCtx)
	status.ProfileName = localAWSProfileName
	status.ConfigPath = s.settings.AWSConfigPath
	status.CredsPath = s.settings.AWSCredentialsPath
	status.Endpoint = "http://localhost:4566"
	if strings.TrimSpace(status.Summary) == "" {
		status.Summary = fmt.Sprintf("Local AWS profile %q is ready in your AWS config. Open it from the Connect screen.", localAWSProfileName)
	}
	return emulatorActionResult("prepareProfile", status), nil
}

// writeLocalAWSProfile upserts the LocalStack-targeted profile into the user's
// real AWS config and credentials files (dual-write alongside EnsureManagedProfile
// under LocalConfigDir) so discovery and Connect can open it. Other sections are
// preserved.
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

// writeLocalAzureSubscription upserts a floci-az-targeted subscription into the
// user's real Azure profile (dual-write alongside EnsureManagedConfig under
// LocalConfigDir) so it is discovered and can be opened. Existing subscriptions
// are preserved.
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

// upsertINISection writes or replaces a single [header] section's body in an INI
// file while preserving all other sections, comments, and formatting. The file
// and its parent directory are created when missing.

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
		s.invalidateRuntimeStatus()
		return result, nil
	}
	if s.localstackMgr == nil {
		return models.EmulatorActionResult{}, errors.New("LocalStack manager not available")
	}
	startTimeout := 20 * time.Second
	if options.Recreate {
		startTimeout = 90 * time.Second
	}
	actionCtx, cancel := context.WithTimeout(ctx, startTimeout)
	defer cancel()
	status, err := s.localstackMgr.Start(actionCtx, options)
	result := emulatorActionResult("start", status)
	if err != nil {
		return result, errors.New(result.Summary)
	}
	s.invalidateRuntimeStatus()
	return result, nil
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
		s.invalidateRuntimeStatus()
		return result, nil
	}
	if s.localstackMgr == nil {
		return models.EmulatorActionResult{}, errors.New("LocalStack manager not available")
	}
	actionCtx, cancel := context.WithTimeout(ctx, 20*time.Second)
	defer cancel()
	status, err := s.localstackMgr.Stop(actionCtx)
	result := emulatorActionResult("stop", status)
	if err != nil {
		return result, errors.New(result.Summary)
	}
	s.invalidateRuntimeStatus()
	return result, nil
}

func (s *Service) emulatorsLogs(ctx context.Context, emulatorID string, tail int) (models.EmulatorLogSnapshot, error) {
	emulatorID = normaliseEmulatorID(emulatorID)
	logsCtx, cancel := context.WithTimeout(ctx, dockerLogsTimeout)
	defer cancel()
	if emulatorID == "floci-az" {
		if s.azureRuntime == nil {
			return models.EmulatorLogSnapshot{}, errors.New("floci-az manager not available")
		}
		return s.azureRuntime.Logs(logsCtx, tail)
	}
	if s.localstackMgr == nil {
		return models.EmulatorLogSnapshot{}, errors.New("LocalStack manager not available")
	}
	return s.localstackMgr.Logs(logsCtx, tail)
}

func (s *Service) handleEmulatorsList() (any, error) {
	return s.emulatorsList(), nil
}

func (s *Service) handleEmulatorsPrepareProfile(params json.RawMessage) (any, error) {
	var request struct {
		EmulatorID string `json:"emulatorId"`
	}
	_ = json.Unmarshal(params, &request)
	result, err := s.emulatorsPrepareProfile(request.EmulatorID)
	if err != nil {
		return nil, err
	}
	return result, nil
}

func (s *Service) handleEmulatorsStart(ctx context.Context, params json.RawMessage) (any, error) {
	var request models.EmulatorStartOptions
	_ = json.Unmarshal(params, &request)
	return s.emulatorsStart(ctx, request)
}

func (s *Service) handleEmulatorsStop(ctx context.Context, params json.RawMessage) (any, error) {
	var request struct {
		EmulatorID string `json:"emulatorId"`
	}
	_ = json.Unmarshal(params, &request)
	return s.emulatorsStop(ctx, request.EmulatorID)
}

func (s *Service) handleEmulatorsLogs(ctx context.Context, params json.RawMessage) (any, error) {
	var request struct {
		EmulatorID string `json:"emulatorId"`
		Tail       int    `json:"tail"`
	}
	_ = json.Unmarshal(params, &request)
	if request.EmulatorID != "" && request.EmulatorID != "localstack" && request.EmulatorID != "floci-az" {
		return nil, fmt.Errorf("emulator %s is not supported", request.EmulatorID)
	}
	return s.emulatorsLogs(ctx, request.EmulatorID, request.Tail)
}

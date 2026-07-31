// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package runtime

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"cloudsprocket/backend/daemon/internal/models"
)

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return value
		}
	}
	return ""
}

func normaliseEmulatorID(value string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return "localstack"
	}
	return value
}

func emulatorActionResult(action string, status models.EmulatorStatusDetail) models.EmulatorActionResult {
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

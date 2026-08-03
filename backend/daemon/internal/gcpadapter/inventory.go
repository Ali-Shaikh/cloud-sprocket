// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package gcpadapter

import (
	"bytes"
	"context"
	"fmt"
	"os/exec"
	"strings"

	"cloudsprocket/backend/daemon/internal/config"
	"cloudsprocket/backend/daemon/internal/models"
	"cloudsprocket/backend/daemon/internal/sysproc"
)

// CLIExecutor shells out to gcloud. Tests inject fakes.
type CLIExecutor interface {
	CommandContext(ctx context.Context, name string, args ...string) ([]byte, error)
}

type execRunner struct{}

func (execRunner) CommandContext(ctx context.Context, name string, args ...string) ([]byte, error) {
	cmd := exec.CommandContext(ctx, name, args...)
	sysproc.Hide(cmd)
	var stderr bytes.Buffer
	cmd.Stderr = &stderr
	payload, err := cmd.Output()
	if err == nil {
		return payload, nil
	}
	detail := strings.TrimSpace(stderr.String())
	const maxDiagnosticLength = 4096
	if len(detail) > maxDiagnosticLength {
		detail = detail[:maxDiagnosticLength] + "..."
	}
	if detail != "" {
		return nil, fmt.Errorf("%w: %s", err, detail)
	}
	return nil, err
}

// Inventory lists GCP resources via the gcloud CLI (no GCP SDK).
type Inventory struct {
	settings config.Settings
	runner   CLIExecutor
}

// NewInventory constructs a production Inventory that shells out to gcloud.
func NewInventory(settings config.Settings) *Inventory {
	return &Inventory{
		settings: settings,
		runner:   execRunner{},
	}
}

func (i *Inventory) run(ctx context.Context, profile models.ProfileSummary, args ...string) ([]byte, error) {
	runner := i.runner
	if runner == nil {
		runner = execRunner{}
	}
	fullArgs := make([]string, 0, len(args)+2)
	if configName := strings.TrimSpace(profile.ProfileID); configName != "" {
		fullArgs = append(fullArgs, "--configuration="+configName)
	}
	fullArgs = append(fullArgs, args...)
	payload, err := runner.CommandContext(ctx, "gcloud", fullArgs...)
	if err != nil {
		return nil, fmt.Errorf("gcloud %s: %w", strings.Join(fullArgs, " "), err)
	}
	return payload, nil
}

func projectFromProfile(profile models.ProfileSummary) string {
	for _, field := range profile.Attributes {
		if strings.EqualFold(strings.TrimSpace(field.Label), "Project") {
			return strings.TrimSpace(field.Value)
		}
	}
	return ""
}

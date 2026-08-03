// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package aws

import (
	"errors"
	"strings"

	"cloudsprocket/backend/daemon/internal/models"
)

// ValidateLambdaCreateInput checks starter Lambda create request fields.
func ValidateLambdaCreateInput(input models.AwsLambdaCreateInput) error {
	name := strings.TrimSpace(input.FunctionName)
	if name == "" {
		return errors.New("function name is required")
	}
	if len(name) > 64 {
		return errors.New("function name must be 64 characters or fewer")
	}
	for _, r := range name {
		if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') || r == '-' || r == '_' {
			continue
		}
		return errors.New("function name may only contain letters, numbers, hyphens, and underscores")
	}
	runtime := strings.TrimSpace(input.Runtime)
	if runtime == "" {
		return errors.New("runtime is required")
	}
	allowedRuntimes := map[string]struct{}{
		"nodejs22.x": {},
		"nodejs20.x": {},
		"python3.12": {},
		"python3.11": {},
	}
	if _, ok := allowedRuntimes[runtime]; !ok {
		return errors.New("runtime is not supported for starter function create")
	}
	if input.MemorySize != 0 && (input.MemorySize < 128 || input.MemorySize > 10240) {
		return errors.New("memory must be between 128 and 10240 MB")
	}
	if input.Timeout != 0 && (input.Timeout < 1 || input.Timeout > 900) {
		return errors.New("timeout must be between 1 and 900 seconds")
	}
	zipPath := strings.TrimSpace(input.ZipSourcePath)
	handlerSource := strings.TrimSpace(input.HandlerSource)
	if zipPath != "" && handlerSource != "" {
		return errors.New("provide either inline handler source or a zip file, not both")
	}
	if zipPath != "" && strings.TrimSpace(input.Handler) == "" {
		return errors.New("handler is required when using a zip file")
	}
	if handlerSource != "" && len(handlerSource) > 256*1024 {
		return errors.New("inline handler source must be 256 KB or smaller")
	}
	return nil
}

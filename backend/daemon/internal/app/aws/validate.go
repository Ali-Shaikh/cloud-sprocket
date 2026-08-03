// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package aws

import (
	"errors"
	"fmt"
	"os"
	"strings"

	"cloudsprocket/backend/daemon/internal/models"
)

// ValidateS3UploadRequest checks local source path and destination object key
// rules used by aws.s3.uploadObject (and Azure blob upload reuses the same rules).
func ValidateS3UploadRequest(sourcePath string, objectKey string) error {
	sourcePath = strings.TrimSpace(sourcePath)
	objectKey = strings.TrimSpace(objectKey)
	if sourcePath == "" || objectKey == "" {
		return errors.New("source path and destination object key are required")
	}
	if strings.HasPrefix(objectKey, "/") || strings.HasPrefix(objectKey, "\\") {
		return errors.New("destination object key must be relative to the selected bucket")
	}
	if strings.Contains(objectKey, "\\") {
		return errors.New("destination object key must use forward slashes")
	}
	for _, segment := range strings.Split(objectKey, "/") {
		if segment == "." || segment == ".." {
			return errors.New("destination object key must not contain dot path segments")
		}
	}
	if strings.ContainsAny(objectKey, "\x00\r\n\t") {
		return errors.New("destination object key contains unsupported control characters")
	}
	info, err := os.Stat(sourcePath)
	if err != nil {
		return fmt.Errorf("source file is not available: %w", err)
	}
	if info.IsDir() || !info.Mode().IsRegular() {
		return errors.New("source path must be a regular file")
	}
	const maxUploadBytes = 512 * 1024 * 1024
	if info.Size() > maxUploadBytes {
		return errors.New("source file is larger than the current 512 MiB upload safety limit")
	}
	return nil
}

// ClampPresignDuration normalises a requested presign TTL to AWS SigV4 limits.
func ClampPresignDuration(durationSeconds int) int {
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

// EC2DesiredState returns the state polled after a lifecycle action, if any.
func EC2DesiredState(action string) string {
	switch strings.ToLower(strings.TrimSpace(action)) {
	case "start", "reboot":
		return "running"
	case "stop":
		return "stopped"
	default:
		return ""
	}
}

// SelectedEC2State returns the state of the instance with the given id.
func SelectedEC2State(instances []models.AwsEc2Instance, instanceID string) string {
	for _, instance := range instances {
		if instance.InstanceID == instanceID {
			return instance.State
		}
	}
	return ""
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return value
		}
	}
	return ""
}

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

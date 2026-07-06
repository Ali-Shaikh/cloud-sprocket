// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package app

import (
	"context"
	"errors"
	"fmt"
	"net"
	"net/url"
	"os"
	"strings"

	"cloudsprocket/backend/daemon/internal/models"
)

// withAWSTimeout bounds AWS (S3, EC2, Lambda, ...) inventory and action calls.
// Mirrors the Azure pattern for production resilience: a stalled real-AWS or
// LocalStack response cannot hang workspace snapshots or user actions. It reuses
// the same 30s default as Azure for consistency; a non-positive timeout (test
// constructs) is a no-op.
func (s *Service) withAWSTimeout(ctx context.Context) (context.Context, context.CancelFunc) {
	if s.azureInventoryTimeout <= 0 {
		return ctx, func() {}
	}
	return context.WithTimeout(ctx, s.azureInventoryTimeout)
}

func (s *Service) withAzureTimeout(ctx context.Context) (context.Context, context.CancelFunc) {
	if s.azureInventoryTimeout <= 0 {
		return ctx, func() {}
	}
	return context.WithTimeout(ctx, s.azureInventoryTimeout)
}

func profileEndpointURL(profile models.ProfileSummary) string {
	for _, field := range profile.Attributes {
		if normaliseProfileFieldLabel(field.Label) == "endpointurl" {
			return strings.TrimSpace(field.Value)
		}
	}
	return ""
}

const awsWriteModeRequiredMessage = "Turn on write mode from the top bar to run mutating actions."

func profileIsLocalAWSEndpoint(profile models.ProfileSummary) bool {
	endpointURL := profileEndpointURL(profile)
	if endpointURL == "" {
		return false
	}
	parsed, err := url.Parse(endpointURL)
	if err != nil {
		return false
	}
	host := parsed.Hostname()
	if strings.Contains(strings.ToLower(host), "localstack") || host == "localhost" || host == "127.0.0.1" {
		return true
	}
	ip := net.ParseIP(host)
	return ip != nil && ip.IsPrivate()
}

// profileAllowsAWSWrites reports whether the profile targets a local emulator
// endpoint. It is used for UI copy and policy summaries, not for gating writes.
func profileAllowsAWSWrites(profile models.ProfileSummary) bool {
	return profileIsLocalAWSEndpoint(profile)
}

func profileAllowsWriteOptIn(profile models.ProfileSummary) bool {
	for _, field := range profile.Attributes {
		if normaliseProfileFieldLabel(field.Label) == "cloudsprocketallowwrites" {
			value := strings.ToLower(strings.TrimSpace(field.Value))
			return value == "1" || value == "true" || value == "yes"
		}
	}
	return false
}

func effectiveAWSWritesEnabled(session models.SessionSnapshot, _ models.ProfileSummary) bool {
	return session.IsLocked && session.AWSWriteModeEnabled
}

func validateLambdaCreateInput(input models.AwsLambdaCreateInput) error {
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

func validateS3UploadRequest(sourcePath string, objectKey string) error {
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

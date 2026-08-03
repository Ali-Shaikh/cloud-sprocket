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

	appaws "cloudsprocket/backend/daemon/internal/app/aws"
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
	return appaws.ValidateLambdaCreateInput(input)
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

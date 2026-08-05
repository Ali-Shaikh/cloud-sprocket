// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package azure

import (
	"errors"
	"fmt"
	"os"
	"strings"
)

// ValidateBlobUploadRequest checks local source path and destination blob name.
func ValidateBlobUploadRequest(sourcePath string, blobName string) error {
	sourcePath = strings.TrimSpace(sourcePath)
	blobName = strings.TrimSpace(blobName)
	if sourcePath == "" || blobName == "" {
		return errors.New("source path and destination blob name are required")
	}
	if strings.HasPrefix(blobName, "/") || strings.HasPrefix(blobName, "\\") {
		return errors.New("destination blob name must be relative to the selected container")
	}
	if strings.Contains(blobName, "\\") {
		return errors.New("destination blob name must use forward slashes")
	}
	for _, segment := range strings.Split(blobName, "/") {
		if segment == "." || segment == ".." {
			return errors.New("destination object key must not contain dot path segments")
		}
	}
	if strings.ContainsAny(blobName, "\x00\r\n\t") {
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

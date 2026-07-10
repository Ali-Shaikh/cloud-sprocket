// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package recipes

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// ImportTrust is the on-disk acceptance record written under an imported recipe.
type ImportTrust struct {
	ContentHash string `json:"contentHash"`
	AcceptedAt  string `json:"acceptedAt,omitempty"`
	SourceType  string `json:"sourceType,omitempty"`
	SourcePath  string `json:"sourcePath,omitempty"`
	ID          string `json:"id,omitempty"`
	Version     string `json:"version,omitempty"`
}

// ReadImportTrust loads .import-trust.json from a recipe directory.
func ReadImportTrust(dir string) (ImportTrust, error) {
	data, err := os.ReadFile(filepath.Join(dir, trustFileName))
	if err != nil {
		return ImportTrust{}, err
	}
	var trust ImportTrust
	if err := json.Unmarshal(data, &trust); err != nil {
		return ImportTrust{}, fmt.Errorf("parse trust record: %w", err)
	}
	return trust, nil
}

// TrustValid re-hashes the tree and compares it to the stored acceptance hash.
// Returns false when the trust file is missing, unreadable, or the hash differs.
func TrustValid(dir string) bool {
	trust, err := ReadImportTrust(dir)
	if err != nil || strings.TrimSpace(trust.ContentHash) == "" {
		return false
	}
	hash, err := ContentHash(dir)
	if err != nil {
		return false
	}
	return hash == trust.ContentHash
}

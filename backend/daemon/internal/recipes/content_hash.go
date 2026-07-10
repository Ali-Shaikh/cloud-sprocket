// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package recipes

import (
	"crypto/sha256"
	"encoding/hex"
	"io/fs"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

const trustFileName = ".import-trust.json"

// TrustFileName is the on-disk acceptance record name for imported recipes.
func TrustFileName() string { return trustFileName }

// ContentHash returns a stable sha256 over relative paths and file contents under
// root (excluding VCS/tooling dirs and .import-trust.json). Used by the import
// trust gate and re-check when loading imported recipes.
func ContentHash(root string) (string, error) {
	type entry struct {
		rel  string
		data []byte
	}
	var files []entry
	err := filepath.WalkDir(root, func(path string, d fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		rel, err := filepath.Rel(root, path)
		if err != nil {
			return err
		}
		if rel == "." {
			return nil
		}
		if shouldSkipImportRel(rel) {
			if d.IsDir() {
				return fs.SkipDir
			}
			return nil
		}
		if d.IsDir() {
			return nil
		}
		if filepath.Base(rel) == trustFileName {
			return nil
		}
		b, err := os.ReadFile(path)
		if err != nil {
			return err
		}
		files = append(files, entry{rel: filepath.ToSlash(rel), data: b})
		return nil
	})
	if err != nil {
		return "", err
	}
	sort.Slice(files, func(i, j int) bool { return files[i].rel < files[j].rel })
	h := sha256.New()
	for _, f := range files {
		_, _ = h.Write([]byte(f.rel))
		_, _ = h.Write([]byte{0})
		_, _ = h.Write(f.data)
		_, _ = h.Write([]byte{0})
	}
	return hex.EncodeToString(h.Sum(nil)), nil
}

// ShouldSkipImportRel skips VCS and tooling path components during hash/copy.
func ShouldSkipImportRel(rel string) bool {
	parts := strings.Split(filepath.ToSlash(rel), "/")
	for _, p := range parts {
		switch p {
		case ".git", ".svn", ".hg", ".jj", "node_modules", ".terraform":
			return true
		}
	}
	return false
}

// shouldSkipImportRel is the internal alias used by this package.
func shouldSkipImportRel(rel string) bool { return ShouldSkipImportRel(rel) }

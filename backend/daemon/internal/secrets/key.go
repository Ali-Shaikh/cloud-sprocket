package secrets

import (
	"crypto/rand"
	"encoding/base64"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
)

// LoadOrCreateKey returns the 32-byte encryption key at path, creating and
// persisting a new random key (0600) when none exists. Keeping the key in a
// separate, restricted file removes sensitive values from the database itself;
// moving the key into the OS keychain is a planned hardening.
func LoadOrCreateKey(path string) ([]byte, error) {
	if data, err := os.ReadFile(path); err == nil {
		if key, derr := base64.StdEncoding.DecodeString(strings.TrimSpace(string(data))); derr == nil && len(key) == 32 {
			return key, nil
		}
	}

	key := make([]byte, 32)
	if _, err := io.ReadFull(rand.Reader, key); err != nil {
		return nil, fmt.Errorf("secrets: generate key: %w", err)
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return nil, fmt.Errorf("secrets: create key dir: %w", err)
	}
	if err := os.WriteFile(path, []byte(base64.StdEncoding.EncodeToString(key)), 0o600); err != nil {
		return nil, fmt.Errorf("secrets: write key: %w", err)
	}
	return key, nil
}

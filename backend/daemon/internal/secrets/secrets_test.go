// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package secrets

import (
	"bytes"
	"crypto/rand"
	"io"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func newTestCipher(t *testing.T) *Cipher {
	t.Helper()
	key := make([]byte, 32)
	if _, err := io.ReadFull(rand.Reader, key); err != nil {
		t.Fatal(err)
	}
	cipher, err := NewCipher(key)
	if err != nil {
		t.Fatalf("NewCipher: %v", err)
	}
	return cipher
}

func TestSealOpenRoundTrip(t *testing.T) {
	cipher := newTestCipher(t)
	for _, plaintext := range []string{"", "s3cr3t", "a longer secret with spaces and symbols !@#"} {
		token, err := cipher.Seal(plaintext)
		if err != nil {
			t.Fatalf("Seal: %v", err)
		}
		if !IsSealed(token) {
			t.Fatalf("expected token to be sealed: %q", token)
		}
		if strings.Contains(token, plaintext) && plaintext != "" {
			t.Fatalf("plaintext leaked into token: %q", token)
		}
		got, err := cipher.Open(token)
		if err != nil {
			t.Fatalf("Open: %v", err)
		}
		if got != plaintext {
			t.Fatalf("round trip = %q, want %q", got, plaintext)
		}
	}
}

func TestOpenResealsLegacyPlaintext(t *testing.T) {
	cipher := newTestCipher(t)
	// Legacy plaintext is still returned as the usable secret, but Open
	// re-seals it so callers can persist the enc:v1: form.
	got, err := cipher.Open("plain-value")
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	if got != "plain-value" {
		t.Fatalf("plaintext = %q, want plain-value", got)
	}
	if cipher.ResealCount() != 1 {
		t.Fatalf("ResealCount = %d, want 1", cipher.ResealCount())
	}

	// Empty strings stay empty and do not count as a reseal.
	empty, err := cipher.Open("")
	if err != nil {
		t.Fatalf("Open empty: %v", err)
	}
	if empty != "" {
		t.Fatalf("empty open = %q", empty)
	}
	if cipher.ResealCount() != 1 {
		t.Fatalf("ResealCount after empty = %d, want 1", cipher.ResealCount())
	}
}

func TestOpenDetailedPlaintextToSealedRoundTrip(t *testing.T) {
	cipher := newTestCipher(t)
	const legacy = "legacy-db-password"

	first, err := cipher.OpenDetailed(legacy)
	if err != nil {
		t.Fatalf("OpenDetailed: %v", err)
	}
	if !first.DidReseal {
		t.Fatal("expected DidReseal for legacy plaintext")
	}
	if first.Plaintext != legacy {
		t.Fatalf("plaintext = %q, want %q", first.Plaintext, legacy)
	}
	if !IsSealed(first.Sealed) {
		t.Fatalf("expected sealed token, got %q", first.Sealed)
	}
	if strings.Contains(first.Sealed, legacy) {
		t.Fatal("plaintext leaked into resealed token")
	}
	if cipher.ResealCount() != 1 {
		t.Fatalf("ResealCount = %d, want 1", cipher.ResealCount())
	}

	// Opening the resealed token returns the original plaintext and does not
	// reseal again.
	second, err := cipher.OpenDetailed(first.Sealed)
	if err != nil {
		t.Fatalf("OpenDetailed sealed: %v", err)
	}
	if second.DidReseal {
		t.Fatal("already-sealed token should not reseal")
	}
	if second.Plaintext != legacy {
		t.Fatalf("round trip plaintext = %q, want %q", second.Plaintext, legacy)
	}
	if second.Sealed != first.Sealed {
		t.Fatalf("sealed form changed: %q vs %q", second.Sealed, first.Sealed)
	}
	if cipher.ResealCount() != 1 {
		t.Fatalf("ResealCount after sealed open = %d, want 1", cipher.ResealCount())
	}
}

func TestOpenRejectsTamperedToken(t *testing.T) {
	cipher := newTestCipher(t)
	token, err := cipher.Seal("secret")
	if err != nil {
		t.Fatal(err)
	}
	// Flip the last base64 character.
	tampered := token[:len(token)-1] + map[bool]string{true: "A", false: "B"}[token[len(token)-1] != 'A']
	if _, err := cipher.Open(tampered); err == nil {
		t.Fatal("expected an error opening a tampered token")
	}
}

func TestOpenFailsWithWrongKey(t *testing.T) {
	token, err := newTestCipher(t).Seal("secret")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := newTestCipher(t).Open(token); err == nil {
		t.Fatal("expected an error opening with the wrong key")
	}
}

func TestNewCipherRejectsBadKeyLength(t *testing.T) {
	if _, err := NewCipher([]byte("short")); err == nil {
		t.Fatal("expected an error for a non-32-byte key")
	}
}

func TestLoadOrCreateKeyPersistsAndReloads(t *testing.T) {
	path := filepath.Join(t.TempDir(), "nested", "secret.key")
	first, err := LoadOrCreateKey(path)
	if err != nil {
		t.Fatalf("LoadOrCreateKey: %v", err)
	}
	if len(first) != 32 {
		t.Fatalf("key length = %d", len(first))
	}
	if _, err := os.Stat(path); err != nil {
		t.Fatalf("key file not written: %v", err)
	}
	second, err := LoadOrCreateKey(path)
	if err != nil {
		t.Fatalf("LoadOrCreateKey (reload): %v", err)
	}
	if !bytes.Equal(first, second) {
		t.Fatal("expected a stable key across loads")
	}
}

func TestLoadOrCreateKeyRejectsCorruptExistingKeyWithoutReplacingIt(t *testing.T) {
	path := filepath.Join(t.TempDir(), "secret.key")
	original := []byte("not-valid-base64")
	if err := os.WriteFile(path, original, 0o600); err != nil {
		t.Fatal(err)
	}

	if _, err := LoadOrCreateKey(path); err == nil {
		t.Fatal("expected corrupt key to be rejected")
	}
	got, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(got, original) {
		t.Fatalf("corrupt key was replaced: got %q", got)
	}
}

func TestLoadOrCreateKeyRejectsExistingUnreadablePath(t *testing.T) {
	path := filepath.Join(t.TempDir(), "secret.key")
	if err := os.Mkdir(path, 0o700); err != nil {
		t.Fatal(err)
	}

	if _, err := LoadOrCreateKey(path); err == nil {
		t.Fatal("expected an existing directory to be rejected as a key")
	}
	info, err := os.Stat(path)
	if err != nil {
		t.Fatal(err)
	}
	if !info.IsDir() {
		t.Fatal("existing key path was replaced")
	}
}

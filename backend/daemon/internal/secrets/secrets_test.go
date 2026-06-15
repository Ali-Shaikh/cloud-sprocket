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

func TestOpenPassesThroughPlaintext(t *testing.T) {
	cipher := newTestCipher(t)
	// A value that is not a sealed token is returned unchanged (back-compat).
	got, err := cipher.Open("plain-value")
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	if got != "plain-value" {
		t.Fatalf("passthrough = %q", got)
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

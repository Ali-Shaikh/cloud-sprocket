// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

// Package secrets seals sensitive values (recipe variables, Terraform outputs)
// so they are not persisted in plaintext in the local database. Values are
// encrypted with AES-256-GCM using a per-install key (see key.go). Sealed
// tokens carry a version prefix. Legacy plaintext from older builds is still
// readable and is re-sealed on Open so callers can persist the sealed form.
package secrets

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"fmt"
	"io"
	"log"
	"strings"
	"sync/atomic"
)

const tokenPrefix = "enc:v1:"

// Cipher seals and opens secret strings.
type Cipher struct {
	aead        cipher.AEAD
	resealCount atomic.Uint64
}

// NewCipher builds a cipher from a 32-byte (AES-256) key.
func NewCipher(key []byte) (*Cipher, error) {
	if len(key) != 32 {
		return nil, fmt.Errorf("secrets: key must be 32 bytes, got %d", len(key))
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	aead, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	return &Cipher{aead: aead}, nil
}

// Seal encrypts plaintext and returns a versioned, base64-encoded token.
func (c *Cipher) Seal(plaintext string) (string, error) {
	nonce := make([]byte, c.aead.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return "", err
	}
	sealed := c.aead.Seal(nonce, nonce, []byte(plaintext), nil)
	return tokenPrefix + base64.StdEncoding.EncodeToString(sealed), nil
}

// OpenResult is the outcome of opening a token, including transparent
// re-seal of legacy plaintext so callers can persist the sealed form.
type OpenResult struct {
	// Plaintext is the usable secret value.
	Plaintext string
	// Sealed is an enc:v1: token suitable for at-rest storage. For already
	// sealed input it equals the input. For legacy plaintext it is newly
	// produced. Empty string input yields an empty Sealed value.
	Sealed string
	// DidReseal is true when Sealed was produced from legacy plaintext.
	DidReseal bool
}

// Open decrypts a token produced by Seal and returns the usable plaintext.
//
// Values that are not enc:v1: tokens (legacy plaintext from older builds) are
// re-sealed so they can be upgraded at rest: ResealCount is incremented, a
// log line is written, and the sealed form is available via OpenDetailed.
// Empty strings are left unchanged and do not count as a reseal.
func (c *Cipher) Open(token string) (string, error) {
	result, err := c.OpenDetailed(token)
	if err != nil {
		return "", err
	}
	return result.Plaintext, nil
}

// OpenDetailed is like Open but also returns the sealed form for write-back.
// When DidReseal is true, Sealed should replace the legacy plaintext in storage.
func (c *Cipher) OpenDetailed(token string) (OpenResult, error) {
	if !IsSealed(token) {
		if token == "" {
			return OpenResult{}, nil
		}
		sealed, err := c.Seal(token)
		if err != nil {
			return OpenResult{}, fmt.Errorf("secrets: re-seal legacy plaintext: %w", err)
		}
		n := c.resealCount.Add(1)
		log.Printf("secrets: re-sealed legacy plaintext value (reseal_count=%d)", n)
		return OpenResult{Plaintext: token, Sealed: sealed, DidReseal: true}, nil
	}

	raw, err := base64.StdEncoding.DecodeString(strings.TrimPrefix(token, tokenPrefix))
	if err != nil {
		return OpenResult{}, fmt.Errorf("secrets: decode token: %w", err)
	}
	nonceSize := c.aead.NonceSize()
	if len(raw) < nonceSize {
		return OpenResult{}, errors.New("secrets: ciphertext too short")
	}
	nonce, ciphertext := raw[:nonceSize], raw[nonceSize:]
	plaintext, err := c.aead.Open(nil, nonce, ciphertext, nil)
	if err != nil {
		return OpenResult{}, fmt.Errorf("secrets: open token: %w", err)
	}
	return OpenResult{Plaintext: string(plaintext), Sealed: token, DidReseal: false}, nil
}

// ResealCount returns how many legacy plaintext values have been re-sealed by
// Open or OpenDetailed since this cipher was created.
func (c *Cipher) ResealCount() uint64 {
	return c.resealCount.Load()
}

// IsSealed reports whether a value is a sealed token.
func IsSealed(token string) bool {
	return strings.HasPrefix(token, tokenPrefix)
}

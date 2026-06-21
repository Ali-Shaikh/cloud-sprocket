// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

// Package secrets seals sensitive values (recipe variables, Terraform outputs)
// so they are not persisted in plaintext in the local database. Values are
// encrypted with AES-256-GCM using a per-install key (see key.go). Sealed
// tokens carry a version prefix so plaintext written by older builds is still
// readable (it is returned as-is) and can be migrated transparently.
package secrets

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"fmt"
	"io"
	"strings"
)

const tokenPrefix = "enc:v1:"

// Cipher seals and opens secret strings.
type Cipher struct {
	aead cipher.AEAD
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

// Open decrypts a token produced by Seal. A value that is not a sealed token is
// returned unchanged, so plaintext persisted by older builds keeps working.
func (c *Cipher) Open(token string) (string, error) {
	if !IsSealed(token) {
		return token, nil
	}
	raw, err := base64.StdEncoding.DecodeString(strings.TrimPrefix(token, tokenPrefix))
	if err != nil {
		return "", fmt.Errorf("secrets: decode token: %w", err)
	}
	nonceSize := c.aead.NonceSize()
	if len(raw) < nonceSize {
		return "", errors.New("secrets: ciphertext too short")
	}
	nonce, ciphertext := raw[:nonceSize], raw[nonceSize:]
	plaintext, err := c.aead.Open(nil, nonce, ciphertext, nil)
	if err != nil {
		return "", fmt.Errorf("secrets: open token: %w", err)
	}
	return string(plaintext), nil
}

// IsSealed reports whether a value is a sealed token.
func IsSealed(token string) bool {
	return strings.HasPrefix(token, tokenPrefix)
}

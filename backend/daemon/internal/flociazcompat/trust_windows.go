//go:build windows

// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package flociazcompat

import (
	"bytes"
	"context"
	"crypto/x509"
	"encoding/pem"
	"fmt"
	"os"
	"runtime"
	"unsafe"

	"golang.org/x/sys/windows"
)

// flociCertCommonName is the Subject/Issuer CN floci-az uses for its self-signed
// TLS certificate. We only ever manage certificates with this exact CN so we
// never touch the user's own trust anchors.
const flociCertCommonName = "floci-az"

// ensurePlatformTrust makes the floci-az certificate trusted by OpenTofu on
// Windows.
//
// Go's TLS stack ignores SSL_CERT_FILE on Windows and verifies server
// certificates against the platform certificate store only, so writing the PEM
// to disk (see TofuEnvironment) is not sufficient there. OpenTofu is a Go
// binary, so its azurerm provider fails with "x509: certificate signed by
// unknown authority" unless the cert lives in a Windows trust store.
//
// The certificate is installed into the *current user's* Root store, which does
// not require administrator rights. Adding a new trust anchor to the Root store
// raises the standard Windows "Security Warning" confirmation once (the same
// one-time dialog tools like mkcert show); the user accepts it to trust the
// local emulator. This function is therefore idempotent: if the exact cert is
// already trusted it returns immediately without touching the store, so steady-
// state deploys never re-prompt. floci-az keeps a stable cert for the lifetime
// of a container, so the dialog only appears the first time a new container's
// cert is seen. We deliberately do not delete superseded floci-az certs:
// removing a Root trust anchor would raise its own confirmation, and a handful
// of stale self-signed localhost certs is harmless.
//
// We use the crypt32 API directly rather than certutil because certutil's
// Root-store operations also gate on the same confirmation and offer no
// idempotent "add only if absent" path.
func ensurePlatformTrust(_ context.Context, certPath string) error {
	der, cn, err := readCertDER(certPath)
	if err != nil {
		return err
	}
	// Defensive: only ever modify the user's trust store for floci-az certs.
	if cn != flociCertCommonName {
		return nil
	}
	return installUserRootCert(der)
}

func readCertDER(certPath string) ([]byte, string, error) {
	data, err := os.ReadFile(certPath)
	if err != nil {
		return nil, "", fmt.Errorf("read floci-az certificate %s: %w", certPath, err)
	}
	block, _ := pem.Decode(data)
	if block == nil {
		return nil, "", fmt.Errorf("floci-az certificate %s is not PEM-encoded", certPath)
	}
	cert, err := x509.ParseCertificate(block.Bytes)
	if err != nil {
		return nil, "", fmt.Errorf("parse floci-az certificate %s: %w", certPath, err)
	}
	return block.Bytes, cert.Subject.CommonName, nil
}

// installUserRootCert trusts der in the current user's Root store, but only if
// an identical certificate is not already present. The presence check makes the
// operation idempotent and, crucially, avoids re-triggering the Windows trust
// confirmation on every deploy: CertAddCertificateContextToStore prompts when it
// adds a new Root anchor, so we must not call it once the cert is already
// trusted.
func installUserRootCert(der []byte) error {
	if len(der) == 0 {
		return fmt.Errorf("floci-az certificate is empty")
	}
	storeName, err := windows.UTF16PtrFromString("Root")
	if err != nil {
		return err
	}
	store, err := windows.CertOpenStore(
		windows.CERT_STORE_PROV_SYSTEM_W,
		0,
		0,
		windows.CERT_SYSTEM_STORE_CURRENT_USER,
		uintptr(unsafe.Pointer(storeName)),
	)
	runtime.KeepAlive(storeName)
	if err != nil {
		return fmt.Errorf("open user Root certificate store: %w", err)
	}
	defer windows.CertCloseStore(store, 0)

	if certAlreadyTrusted(store, der) {
		return nil
	}

	ours, err := windows.CertCreateCertificateContext(windows.X509_ASN_ENCODING, &der[0], uint32(len(der)))
	if err != nil {
		return fmt.Errorf("create floci-az certificate context: %w", err)
	}
	defer windows.CertFreeCertificateContext(ours)

	// Adds a new trust anchor; raises the one-time Windows "Security Warning".
	if err := windows.CertAddCertificateContextToStore(store, ours, windows.CERT_STORE_ADD_REPLACE_EXISTING, nil); err != nil {
		return fmt.Errorf("trust floci-az certificate in user Root store: %w", err)
	}
	return nil
}

// certAlreadyTrusted reports whether a certificate byte-identical to der is
// already present in the open store.
func certAlreadyTrusted(store windows.Handle, der []byte) bool {
	var prev *windows.CertContext
	for {
		cur, err := windows.CertEnumCertificatesInStore(store, prev)
		if cur == nil || err != nil {
			return false
		}
		if bytes.Equal(certContextDER(cur), der) {
			return true
		}
		prev = cur
	}
}

func certContextDER(ctx *windows.CertContext) []byte {
	if ctx == nil || ctx.EncodedCert == nil || ctx.Length == 0 {
		return nil
	}
	return unsafe.Slice(ctx.EncodedCert, ctx.Length)
}

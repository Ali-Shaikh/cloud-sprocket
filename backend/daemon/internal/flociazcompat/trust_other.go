//go:build !windows

// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package flociazcompat

import "context"

// ensurePlatformTrust is a no-op on non-Windows platforms. Go honours
// SSL_CERT_FILE there, so pointing OpenTofu at the on-disk PEM (see
// TofuEnvironment) is enough for the azurerm provider to trust floci-az.
func ensurePlatformTrust(_ context.Context, _ string) error {
	return nil
}

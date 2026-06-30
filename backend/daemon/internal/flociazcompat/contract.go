// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

// Package flociazcompat implements the floci-az OpenTofu compatibility contract
// from floci-io/floci-az compatibility-tests/compat-opentofu (provider.tf,
// run-bats-in-container.sh). CloudSprocket must satisfy this contract before any
// local Azure recipe runs OpenTofu; patching individual azurerm errors is not enough.
package flociazcompat

import "strings"

const (
	// DefaultEndpoint is the local floci-az ARM URL when none is configured.
	DefaultEndpoint = "http://localhost:4577"

	// LocalProfileID is the synthetic Azure profile id written for the local emulator.
	LocalProfileID = "cloudsprocket-floci-az"

	// Placeholder Entra IDs from compat-opentofu/provider.tf. floci-az's Entra shim
	// accepts these; all-zero GUIDs are rejected by azurerm.
	SubscriptionID = "00000000-0000-0000-0000-000000000001"
	TenantID       = "00000000-0000-0000-0000-000000000002"
	ClientID       = "00000000-0000-0000-0000-000000000003"
	ClientSecret   = "fake-secret"

	// TrustCertFilename stores the emulator CA under LocalConfigDir/azure/.
	TrustCertFilename = "floci-az-ca.pem"

	metadataAPIVersion = "2022-09-01"
	tlsCertPath        = "/_floci/tls-cert"
)

// DefaultContainerEnvironment returns the floci-az process environment required
// for OpenTofu compatibility (TLS on the unified port, localhost SAN).
//
// The floci-az container is started with the host Docker socket mounted (see the
// flociaz manager), so docker-backed services such as PostgreSQL Flexible Server
// spawn real sibling containers and work end-to-end.
//
// AKS is the exception: it is forced into mocked mode. floci-az lazily
// initialises the AKS backend the first time the azurerm auth path runs, and in
// real (k3s) mode that pulls and boots a k3s cluster, stalling token issuance —
// and therefore every Azure deploy — even when the recipe never touches AKS.
// Mocking AKS keeps auth fast; unknown env keys are ignored by floci-az.
func DefaultContainerEnvironment() map[string]string {
	return map[string]string{
		"FLOCI_AZ_TLS_ENABLED":         "true",
		"FLOCI_AZ_HOSTNAME":            "localhost",
		"FLOCI_AZ_SERVICES_AKS_MOCKED": "true",
	}
}

// ContainerHasOpenTofuContract reports whether a running container was created
// with the environment azurerm 4.x needs (TLS on port 4577).
func ContainerHasOpenTofuContract(env []string) bool {
	vars := envMap(env)
	required := DefaultContainerEnvironment()
	for key, want := range required {
		if vars[key] != want {
			return false
		}
	}
	return true
}

func envMap(entries []string) map[string]string {
	out := make(map[string]string, len(entries))
	for _, entry := range entries {
		key, value, ok := strings.Cut(entry, "=")
		if !ok || strings.TrimSpace(key) == "" {
			continue
		}
		out[key] = value
	}
	return out
}
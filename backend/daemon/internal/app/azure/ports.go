// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package azure

import (
	"cloudsprocket/backend/daemon/internal/discovery"
)

// Discovery is the provider/profile discovery port used before inventory load.
type Discovery interface {
	Discover() (discovery.Snapshot, error)
}

// ServiceGate reports whether a catalogue service is enabled for a provider.
type ServiceGate interface {
	IsServiceEnabled(providerID, serviceID string) bool
}

// ScopeCatalog maps inventory scopes to catalogue service IDs and validates
// the closed set of azure.inventory.get scopes.
type ScopeCatalog interface {
	IsValidScope(scope string) bool
	ServiceIDForScope(scope string) string
}

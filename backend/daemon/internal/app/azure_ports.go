// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package app

import (
	appazure "cloudsprocket/backend/daemon/internal/app/azure"
)

// azureServiceGate adapts façade service-enablement checks for the Azure domain.
type azureServiceGate struct {
	s *Service
}

func (g azureServiceGate) IsServiceEnabled(providerID, serviceID string) bool {
	if g.s == nil {
		return false
	}
	return g.s.isServiceEnabled(providerID, serviceID)
}

// azureScopeCatalog adapts the shared service catalogue for Azure inventory scopes.
type azureScopeCatalog struct{}

func (azureScopeCatalog) IsValidScope(scope string) bool {
	return appazure.IsValidInventoryScope(scope)
}

func (azureScopeCatalog) ServiceIDForScope(scope string) string {
	return azureServiceIDForInventoryScope(scope)
}

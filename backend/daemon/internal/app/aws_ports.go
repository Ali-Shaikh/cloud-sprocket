// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package app

// awsServiceGate adapts façade service-enablement checks for the AWS domain.
type awsServiceGate struct {
	s *Service
}

func (g awsServiceGate) IsServiceEnabled(providerID, serviceID string) bool {
	if g.s == nil {
		return false
	}
	return g.s.isServiceEnabled(providerID, serviceID)
}

// awsScopeCatalog adapts the shared service catalogue for AWS inventory scopes.
type awsScopeCatalog struct{}

func (awsScopeCatalog) IsValidScope(scope string) bool {
	_, ok := awsInventoryScopesFromCatalog()[scope]
	return ok
}

func (awsScopeCatalog) ServiceIDForScope(scope string) string {
	return awsServiceIDForInventoryScope(scope)
}

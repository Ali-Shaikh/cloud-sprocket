// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package flociazcompat

import "testing"

func TestContainerHasOpenTofuContract(t *testing.T) {
	ok := []string{
		"FLOCI_AZ_TLS_ENABLED=true",
		"FLOCI_AZ_HOSTNAME=localhost",
		"FLOCI_AZ_SERVICES_AKS_MOCKED=true",
		"FLOCI_AZ_SERVICES_FUNCTIONS_ENABLED=false",
	}
	if !ContainerHasOpenTofuContract(ok) {
		t.Fatal("expected contract env to pass")
	}
	stale := []string{"FLOCI_AZ_SERVICES_FUNCTIONS_ENABLED=false"}
	if ContainerHasOpenTofuContract(stale) {
		t.Fatal("expected stale env without TLS settings to fail")
	}
}
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package deploy

import (
	"testing"

	"cloudsprocket/backend/daemon/internal/flociazcompat"
)

func TestNormaliseDeploymentTargetFlociProfile(t *testing.T) {
	deployment := &Deployment{
		ProviderID: "azure",
		ProfileID:  flociazcompat.LocalProfileID,
		Local:      false,
	}
	NormaliseDeploymentTarget(deployment)
	if !deployment.Local || deployment.RuntimeID != "floci-az" || deployment.ProfileID != "" {
		t.Fatalf("expected local floci-az target, got local=%v runtime=%q profile=%q", deployment.Local, deployment.RuntimeID, deployment.ProfileID)
	}
}

func TestNormaliseDeploymentTargetCloudProfileUntouched(t *testing.T) {
	deployment := &Deployment{
		ProviderID: "azure",
		ProfileID:  "00000000-0000-0000-0000-000000000099",
		Local:      false,
	}
	NormaliseDeploymentTarget(deployment)
	if deployment.Local || deployment.RuntimeID != "" || deployment.ProfileID == "" {
		t.Fatalf("cloud profile should be unchanged, got local=%v runtime=%q profile=%q", deployment.Local, deployment.RuntimeID, deployment.ProfileID)
	}
}
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package deploy

// NormaliseDeploymentTarget coerces misconfigured deployments into a valid
// runtime. The floci-az Azure profile is a local emulator profile and must not
// be used as a cloud subscription target.
func NormaliseDeploymentTarget(deployment *Deployment) {
	if deployment == nil {
		return
	}
	if !isLocalFlociProfileID(deployment.ProfileID) {
		return
	}
	deployment.ProviderID = "azure"
	deployment.Local = true
	deployment.RuntimeID = "floci-az"
	deployment.ProfileID = ""
}
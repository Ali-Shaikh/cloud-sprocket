// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package app

import (
	"context"

	"cloudsprocket/backend/daemon/internal/deploy"
)

// deploySecretsAdapter lets the deployment domain seal/open sensitive fields
// without owning the cipher or store write-path for legacy reseals.
type deploySecretsAdapter struct {
	s *Service
}

func (a deploySecretsAdapter) SealForStore(deployment *deploy.Deployment) (*deploy.Deployment, error) {
	return a.s.sealForStore(deployment)
}

func (a deploySecretsAdapter) OpenFromStore(ctx context.Context, deployment *deploy.Deployment, storedPayloadJSON, storedUpdatedAt string) error {
	return a.s.openFromStore(ctx, deployment, storedPayloadJSON, storedUpdatedAt)
}

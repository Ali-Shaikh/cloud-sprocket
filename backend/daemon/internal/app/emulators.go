// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package app

import (
	"context"
	"errors"

	"cloudsprocket/backend/daemon/internal/models"
)

// emulatorsStart is a thin façade wrapper used by labs and tests.
func (s *Service) emulatorsStart(ctx context.Context, options models.EmulatorStartOptions) (models.EmulatorActionResult, error) {
	if s.rt == nil {
		return models.EmulatorActionResult{}, errors.New("runtime service not available")
	}
	return s.rt.StartEmulator(ctx, options)
}

// emulatorsStop is a thin façade wrapper used by labs and tests.
func (s *Service) emulatorsStop(ctx context.Context, emulatorID string) (models.EmulatorActionResult, error) {
	if s.rt == nil {
		return models.EmulatorActionResult{}, errors.New("runtime service not available")
	}
	return s.rt.StopEmulator(ctx, emulatorID)
}

// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package app

import (
	"context"
	"time"

	appruntime "cloudsprocket/backend/daemon/internal/app/runtime"
	"cloudsprocket/backend/daemon/internal/models"
)

// runtimeStatus is a façade alias of the domain status bundle for workspace assembly.
type runtimeStatus = appruntime.Status

func (s *Service) dockerDiagnosticsFromSnapshot(runtime models.DockerRuntimeSnapshot) models.DockerDiagnostics {
	return appruntime.DiagnosticsFromSnapshot(runtime)
}

func (s *Service) runtimeStatusForSnapshot(ctx context.Context) runtimeStatus {
	if s.rt == nil {
		return runtimeStatus{}
	}
	return s.rt.StatusForSnapshot(ctx)
}

func (s *Service) invalidateRuntimeStatus() {
	if s.rt != nil {
		s.rt.InvalidateStatus()
	}
}

func (s *Service) invalidateAzureCLIExtensionCache() {
	s.azureCLIExtMu.Lock()
	defer s.azureCLIExtMu.Unlock()
	s.azureCLIExtProfileID = ""
	s.azureCLIExtStatuses = nil
	s.azureCLIExtAt = time.Time{}
}

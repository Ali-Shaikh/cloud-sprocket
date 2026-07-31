// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package runtime

import (
	"context"

	"cloudsprocket/backend/daemon/internal/models"
)

// Docker is the narrow port for engine probing and managed resource listing.
// Owned by the runtime domain (consumer-owned interface).
type Docker interface {
	Snapshot(ctx context.Context) (models.DockerRuntimeSnapshot, error)
	ListOwnedResources(ctx context.Context) ([]models.ManagedDockerResource, error)
}

// LocalStack is the LocalStack emulator lifecycle port.
type LocalStack interface {
	Status(ctx context.Context) (models.EmulatorStatusDetail, error)
	Start(ctx context.Context, options models.EmulatorStartOptions) (models.EmulatorStatusDetail, error)
	Stop(ctx context.Context) (models.EmulatorStatusDetail, error)
	Logs(ctx context.Context, tail int) (models.EmulatorLogSnapshot, error)
	EnsureManagedProfile() error
}

// AzureRuntime is the floci-az emulator lifecycle port.
type AzureRuntime interface {
	Status(ctx context.Context) (models.EmulatorStatusDetail, error)
	Start(ctx context.Context, options models.EmulatorStartOptions) (models.EmulatorStatusDetail, error)
	Stop(ctx context.Context) (models.EmulatorStatusDetail, error)
	Logs(ctx context.Context, tail int) (models.EmulatorLogSnapshot, error)
	EnsureManagedConfig() error
}

// ResolveDockerHostFunc returns the configured Docker host and its source label
// without importing the concrete dockerruntime adapter from this package.
type ResolveDockerHostFunc func() (host string, source string)

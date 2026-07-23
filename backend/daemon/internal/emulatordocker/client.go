// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

// Package emulatordocker provides shared Docker client surface and pure helpers
// for CloudSprocket-managed container emulators (LocalStack, floci-az).
// Product policy (images, ports, health, recreate, mounts, profiles) stays in
// the per-emulator managers.
package emulatordocker

import (
	"context"

	"github.com/moby/moby/client"
)

// DockerClient is the union of Docker API methods used by emulator managers.
// ContainerInspect is required by floci-az (OpenTofu contract checks).
type DockerClient interface {
	ContainerCreate(ctx context.Context, options client.ContainerCreateOptions) (client.ContainerCreateResult, error)
	ContainerInspect(ctx context.Context, containerID string, options client.ContainerInspectOptions) (client.ContainerInspectResult, error)
	ContainerList(ctx context.Context, options client.ContainerListOptions) (client.ContainerListResult, error)
	ContainerStart(ctx context.Context, container string, options client.ContainerStartOptions) (client.ContainerStartResult, error)
	ContainerStop(ctx context.Context, container string, options client.ContainerStopOptions) (client.ContainerStopResult, error)
	ContainerRemove(ctx context.Context, container string, options client.ContainerRemoveOptions) (client.ContainerRemoveResult, error)
	ContainerLogs(ctx context.Context, container string, options client.ContainerLogsOptions) (client.ContainerLogsResult, error)
	ImagePull(ctx context.Context, ref string, options client.ImagePullOptions) (client.ImagePullResponse, error)
	Close() error
}

// ClientFactory creates a DockerClient for the given host URL.
type ClientFactory func(host string) (DockerClient, error)

// DefaultClientFactory opens a Docker API client with API version negotiation.
func DefaultClientFactory(host string) (DockerClient, error) {
	return client.New(client.WithHost(host), client.WithAPIVersionNegotiation())
}

// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package emulatordocker

import (
	"context"

	containerapi "github.com/moby/moby/api/types/container"
	"github.com/moby/moby/client"
)

// RemoveManagedContainer stops a running container (10s timeout) then force-removes it.
func RemoveManagedContainer(ctx context.Context, api DockerClient, container containerapi.Summary) error {
	if container.State == "running" {
		timeoutSeconds := 10
		if _, err := api.ContainerStop(ctx, container.ID, client.ContainerStopOptions{Timeout: &timeoutSeconds}); err != nil {
			return err
		}
	}
	_, err := api.ContainerRemove(ctx, container.ID, client.ContainerRemoveOptions{Force: true})
	return err
}

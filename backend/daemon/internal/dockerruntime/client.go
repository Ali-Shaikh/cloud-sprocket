package dockerruntime

import (
	"context"

	"github.com/moby/moby/client"
)

type ApiClient interface {
	Ping(ctx context.Context, options client.PingOptions) (client.PingResult, error)
	ServerVersion(ctx context.Context, options client.ServerVersionOptions) (client.ServerVersionResult, error)
	Info(ctx context.Context, options client.InfoOptions) (client.SystemInfoResult, error)
	ContainerList(ctx context.Context, options client.ContainerListOptions) (client.ContainerListResult, error)
	NetworkList(ctx context.Context, options client.NetworkListOptions) (client.NetworkListResult, error)
	VolumeList(ctx context.Context, options client.VolumeListOptions) (client.VolumeListResult, error)
	Close() error
}

type clientFactory func(host string) (ApiClient, error)

func defaultClientFactory(host string) (ApiClient, error) {
	return client.New(
		client.WithHost(host),
		client.WithAPIVersionNegotiation(),
		client.WithUserAgent("cloudsprocket-desktop/0.1.19"),
	)
}

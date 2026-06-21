// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package dockerruntime

import (
	"context"
	"errors"
	"path/filepath"
	"testing"

	"cloudsprocket/backend/daemon/internal/config"
	containerapi "github.com/moby/moby/api/types/container"
	networkapi "github.com/moby/moby/api/types/network"
	systemapi "github.com/moby/moby/api/types/system"
	volumeapi "github.com/moby/moby/api/types/volume"
	"github.com/moby/moby/client"
)

type stubAPIClient struct {
	pingResult      client.PingResult
	pingErr         error
	versionResult   client.ServerVersionResult
	versionErr      error
	infoResult      client.SystemInfoResult
	infoErr         error
	containerResult client.ContainerListResult
	networkResult   client.NetworkListResult
	volumeResult    client.VolumeListResult
	containerErr    error
	networkErr      error
	volumeErr       error
	closed          bool
}

func (s *stubAPIClient) Ping(context.Context, client.PingOptions) (client.PingResult, error) {
	return s.pingResult, s.pingErr
}

func (s *stubAPIClient) ServerVersion(context.Context, client.ServerVersionOptions) (client.ServerVersionResult, error) {
	return s.versionResult, s.versionErr
}

func (s *stubAPIClient) Info(context.Context, client.InfoOptions) (client.SystemInfoResult, error) {
	return s.infoResult, s.infoErr
}

func (s *stubAPIClient) ContainerList(context.Context, client.ContainerListOptions) (client.ContainerListResult, error) {
	return s.containerResult, s.containerErr
}

func (s *stubAPIClient) NetworkList(context.Context, client.NetworkListOptions) (client.NetworkListResult, error) {
	return s.networkResult, s.networkErr
}

func (s *stubAPIClient) VolumeList(context.Context, client.VolumeListOptions) (client.VolumeListResult, error) {
	return s.volumeResult, s.volumeErr
}

func (s *stubAPIClient) Close() error {
	s.closed = true
	return nil
}

func TestSnapshotDoesNotFailDuringAutoDetection(t *testing.T) {
	t.Setenv("DOCKER_HOST", "")
	t.Setenv("DOCKER_CONTEXT", "")
	settings := config.FromEnv(map[string]string{}, "linux", filepath.Join(t.TempDir(), "home"))
	runtime := New(settings)

	snapshot, err := runtime.Snapshot(context.Background())
	if err != nil {
		t.Fatalf("expected snapshot without error, got %v", err)
	}
	if snapshot.Summary == "" {
		t.Fatalf("expected summary during auto-detection, got %+v", snapshot)
	}
}

func TestSnapshotUsesDockerClientData(t *testing.T) {
	t.Setenv("DOCKER_HOST", "unix:///tmp/cloudsprocket-docker.sock")
	t.Setenv("DOCKER_CONTEXT", "desktop-linux")
	settings := config.FromEnv(map[string]string{}, "linux", filepath.Join(t.TempDir(), "home"))
	clientStub := &stubAPIClient{
		pingResult: client.PingResult{APIVersion: "1.51", OSType: "linux"},
		versionResult: client.ServerVersionResult{
			Version:    "28.5.1",
			APIVersion: "1.51",
			Arch:       "x86_64",
			Platform:   client.PlatformInfo{Name: "Docker Desktop"},
		},
		infoResult: client.SystemInfoResult{Info: systemapi.Info{OperatingSystem: "Docker Desktop", DockerRootDir: "/var/lib/docker", Architecture: "x86_64"}},
	}
	runtime := &Runtime{settings: settings, newClient: func(host string) (ApiClient, error) {
		if host != "unix:///tmp/cloudsprocket-docker.sock" {
			t.Fatalf("unexpected host %s", host)
		}
		return clientStub, nil
	}}

	snapshot, err := runtime.Snapshot(context.Background())
	if err != nil {
		t.Fatalf("expected snapshot without error, got %v", err)
	}
	if !snapshot.Reachable {
		t.Fatalf("expected reachable snapshot, got %+v", snapshot)
	}
	if snapshot.ServerVersion != "28.5.1" || snapshot.APIVersion != "1.51" {
		t.Fatalf("expected populated version data, got %+v", snapshot)
	}
	if !clientStub.closed {
		t.Fatalf("expected docker client to close after snapshot")
	}
}

func TestSnapshotReportsConnectionFailure(t *testing.T) {
	t.Setenv("DOCKER_HOST", "unix:///tmp/cloudsprocket-docker.sock")
	settings := config.FromEnv(map[string]string{}, "linux", filepath.Join(t.TempDir(), "home"))
	runtime := &Runtime{settings: settings, newClient: func(host string) (ApiClient, error) {
		return &stubAPIClient{pingErr: errors.New("connection refused")}, nil
	}}

	snapshot, err := runtime.Snapshot(context.Background())
	if err != nil {
		t.Fatalf("expected snapshot without error, got %v", err)
	}
	if snapshot.Reachable {
		t.Fatalf("expected unreachable snapshot, got %+v", snapshot)
	}
	if snapshot.Summary == "" {
		t.Fatalf("expected connection failure summary, got %+v", snapshot)
	}
}

func TestListOwnedResourcesMapsDockerObjects(t *testing.T) {
	t.Setenv("DOCKER_HOST", "unix:///tmp/cloudsprocket-docker.sock")
	settings := config.FromEnv(map[string]string{}, "linux", filepath.Join(t.TempDir(), "home"))
	runtime := &Runtime{settings: settings, newClient: func(host string) (ApiClient, error) {
		return &stubAPIClient{
			containerResult: client.ContainerListResult{Items: []containerapi.Summary{{
				ID:     "ctr-123",
				Names:  []string{"/cloudsprocket-localstack"},
				Image:  "localstack/localstack",
				State:  containerapi.StateRunning,
				Status: "Up 10 seconds",
			}}},
			networkResult: client.NetworkListResult{Items: []networkapi.Summary{{Network: networkapi.Network{ID: "net-123", Name: "cloudsprocket-net", Driver: "bridge", Scope: "local"}}}},
			volumeResult:  client.VolumeListResult{Items: []volumeapi.Volume{{Name: "cloudsprocket-data", Driver: "local", Scope: "local", Mountpoint: "/var/lib/docker/volumes/cloudsprocket-data"}}},
		}, nil
	}}

	resources, err := runtime.ListOwnedResources(context.Background())
	if err != nil {
		t.Fatalf("expected resources without error, got %v", err)
	}
	if len(resources) != 3 {
		t.Fatalf("expected three mapped resources, got %+v", resources)
	}
}

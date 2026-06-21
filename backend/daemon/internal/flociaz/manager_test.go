// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package flociaz

import (
	"bytes"
	"context"
	"io"
	"iter"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"cloudsprocket/backend/daemon/internal/config"
	"cloudsprocket/backend/daemon/internal/models"
	containerapi "github.com/moby/moby/api/types/container"
	jsonstreamapi "github.com/moby/moby/api/types/jsonstream"
	mountapi "github.com/moby/moby/api/types/mount"
	"github.com/moby/moby/client"
)

type stubDockerClient struct {
	containers       []containerapi.Summary
	createCalls      int
	startCalls       []string
	stopCalls        []string
	pullCalls        []string
	closeCalled      bool
	logsPayload      string
	lastCreateEnv    []string
	lastCreateMounts []mountapi.Mount
}

func (s *stubDockerClient) ContainerCreate(_ context.Context, options client.ContainerCreateOptions) (client.ContainerCreateResult, error) {
	s.createCalls++
	s.containers = []containerapi.Summary{{
		ID:     "ctr-created",
		Names:  []string{"/" + options.Name},
		Image:  options.Config.Image,
		State:  containerapi.StateCreated,
		Status: "Created",
	}}
	s.lastCreateEnv = append([]string(nil), options.Config.Env...)
	s.lastCreateMounts = append([]mountapi.Mount(nil), options.HostConfig.Mounts...)
	return client.ContainerCreateResult{ID: "ctr-created"}, nil
}

func (s *stubDockerClient) ContainerList(context.Context, client.ContainerListOptions) (client.ContainerListResult, error) {
	return client.ContainerListResult{Items: append([]containerapi.Summary(nil), s.containers...)}, nil
}

func (s *stubDockerClient) ContainerStart(_ context.Context, container string, _ client.ContainerStartOptions) (client.ContainerStartResult, error) {
	s.startCalls = append(s.startCalls, container)
	for index := range s.containers {
		if s.containers[index].ID == container || container == containerName {
			s.containers[index].State = containerapi.StateRunning
			s.containers[index].Status = "Up 1 second"
		}
	}
	return client.ContainerStartResult{}, nil
}

func (s *stubDockerClient) ContainerStop(_ context.Context, container string, _ client.ContainerStopOptions) (client.ContainerStopResult, error) {
	s.stopCalls = append(s.stopCalls, container)
	for index := range s.containers {
		if s.containers[index].ID == container {
			s.containers[index].State = containerapi.StateExited
			s.containers[index].Status = "Exited"
		}
	}
	return client.ContainerStopResult{}, nil
}

func (s *stubDockerClient) ContainerRemove(context.Context, string, client.ContainerRemoveOptions) (client.ContainerRemoveResult, error) {
	s.containers = nil
	return client.ContainerRemoveResult{}, nil
}

func (s *stubDockerClient) ImagePull(_ context.Context, ref string, _ client.ImagePullOptions) (client.ImagePullResponse, error) {
	s.pullCalls = append(s.pullCalls, ref)
	return stubImagePullResponse{}, nil
}

func (s *stubDockerClient) ContainerLogs(context.Context, string, client.ContainerLogsOptions) (client.ContainerLogsResult, error) {
	return io.NopCloser(bytes.NewBufferString(s.logsPayload)), nil
}

func (s *stubDockerClient) Close() error {
	s.closeCalled = true
	return nil
}

type stubImagePullResponse struct{}

func (stubImagePullResponse) Read([]byte) (int, error) {
	return 0, io.EOF
}

func (stubImagePullResponse) Close() error {
	return nil
}

func (stubImagePullResponse) JSONMessages(context.Context) iter.Seq2[jsonstreamapi.Message, error] {
	return func(func(jsonstreamapi.Message, error) bool) {}
}

func (stubImagePullResponse) Wait(context.Context) error {
	return nil
}

func newTestManager(t *testing.T, stub *stubDockerClient) *Manager {
	t.Helper()
	t.Setenv("DOCKER_HOST", "unix:///tmp/cloudsprocket-test-docker.sock")
	settings := config.FromEnv(map[string]string{}, "linux", filepath.Join(t.TempDir(), "home"))
	if err := settings.EnsureRuntimeDirs(); err != nil {
		t.Fatalf("expected runtime dirs to be created, got %v", err)
	}
	return &Manager{
		settings: settings,
		image:    settings.FlociAZImage,
		newClient: func(host string) (dockerClient, error) {
			if host != "unix:///tmp/cloudsprocket-test-docker.sock" {
				t.Fatalf("unexpected Docker host %s", host)
			}
			return stub, nil
		},
	}
}

func TestStartCreatesAndStartsManagedContainer(t *testing.T) {
	dockerClient := &stubDockerClient{}
	manager := newTestManager(t, dockerClient)

	status, err := manager.Start(context.Background(), models.LocalStackStartOptions{})
	if err != nil {
		t.Fatalf("expected start to succeed, got %v", err)
	}
	if status.EmulatorID != "floci-az" {
		t.Fatalf("expected floci-az status, got %+v", status)
	}
	if dockerClient.createCalls != 1 {
		t.Fatalf("expected one container create call, got %d", dockerClient.createCalls)
	}
	if len(dockerClient.pullCalls) != 1 || dockerClient.pullCalls[0] != defaultImage {
		t.Fatalf("expected floci-az image pull, got %+v", dockerClient.pullCalls)
	}
	if len(dockerClient.startCalls) != 1 || dockerClient.startCalls[0] != containerName {
		t.Fatalf("expected start by managed name, got %+v", dockerClient.startCalls)
	}
	if !dockerClient.closeCalled {
		t.Fatalf("expected Docker client to be closed")
	}
}

func TestStartConfiguresPersistenceAndEnvironment(t *testing.T) {
	dockerClient := &stubDockerClient{}
	manager := newTestManager(t, dockerClient)

	_, err := manager.Start(context.Background(), models.LocalStackStartOptions{
		Persistence: true,
		Environment: map[string]string{
			"FLOCI_AZ_SERVICES_FUNCTIONS_ENABLED": "false",
			"bad-name":                            "ignored",
		},
	})
	if err != nil {
		t.Fatalf("expected start to succeed, got %v", err)
	}
	expectedEnv := []string{
		"FLOCI_AZ_SERVICES_FUNCTIONS_ENABLED=false",
		"FLOCI_AZ_STORAGE_MODE=persistent",
		"FLOCI_AZ_STORAGE_PATH=/app/data",
	}
	if !reflect.DeepEqual(dockerClient.lastCreateEnv, expectedEnv) {
		t.Fatalf("expected floci-az env, got %+v", dockerClient.lastCreateEnv)
	}
	if len(dockerClient.lastCreateMounts) != 1 || dockerClient.lastCreateMounts[0].Target != "/app/data" {
		t.Fatalf("expected floci-az data mount, got %+v", dockerClient.lastCreateMounts)
	}
}

func TestEnsureManagedConfigWritesAzureEnvFile(t *testing.T) {
	manager := newTestManager(t, &stubDockerClient{})

	if err := manager.EnsureManagedConfig(); err != nil {
		t.Fatalf("expected config preparation to succeed, got %v", err)
	}
	content, err := os.ReadFile(manager.localEnvPath())
	if err != nil {
		t.Fatalf("expected env file to be written, got %v", err)
	}
	text := string(content)
	if !strings.Contains(text, "AZURE_STORAGE_CONNECTION_STRING=") || !strings.Contains(text, "http://localhost:4577") {
		t.Fatalf("expected floci-az env values, got %s", text)
	}
}

func TestLogsReturnsManagedContainerLogs(t *testing.T) {
	dockerClient := &stubDockerClient{
		containers: []containerapi.Summary{{
			ID:     "ctr-logs",
			Names:  []string{"/" + containerName},
			Image:  defaultImage,
			State:  containerapi.StateRunning,
			Status: "Up 1 second",
		}},
		logsPayload: "Ready.\nServing Azure APIs on 4577\n",
	}
	manager := newTestManager(t, dockerClient)

	logs, err := manager.Logs(context.Background(), 200)
	if err != nil {
		t.Fatalf("expected logs to succeed, got %v", err)
	}
	expected := []string{"Ready.", "Serving Azure APIs on 4577"}
	if !reflect.DeepEqual(logs.Lines, expected) {
		t.Fatalf("expected log lines, got %+v", logs.Lines)
	}
}

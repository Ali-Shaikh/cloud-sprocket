package localstack

import (
	"bytes"
	"context"
	"errors"
	"io"
	"iter"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"reflect"
	"testing"

	"cloudsprocket/backend/daemon/internal/config"
	"cloudsprocket/backend/daemon/internal/models"
	containerapi "github.com/moby/moby/api/types/container"
	jsonstreamapi "github.com/moby/moby/api/types/jsonstream"
	mountapi "github.com/moby/moby/api/types/mount"
	"github.com/moby/moby/client"
)

type stubDockerClient struct {
	containers         []containerapi.Summary
	createCalls        int
	startCalls         []string
	stopCalls          []string
	removeCalls        []string
	pullCalls          []string
	closeCalled        bool
	containerListError error
	createError        error
	startError         error
	stopError          error
	removeError        error
	pullError          error
	logsError          error
	logsPayload        string
	lastCreateEnv      []string
	lastCreateMounts   []mountapi.Mount
}

func (s *stubDockerClient) ContainerCreate(_ context.Context, options client.ContainerCreateOptions) (client.ContainerCreateResult, error) {
	s.createCalls++
	if s.createError != nil {
		return client.ContainerCreateResult{}, s.createError
	}
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
	if s.containerListError != nil {
		return client.ContainerListResult{}, s.containerListError
	}
	return client.ContainerListResult{Items: append([]containerapi.Summary(nil), s.containers...)}, nil
}

func (s *stubDockerClient) ContainerStart(_ context.Context, container string, _ client.ContainerStartOptions) (client.ContainerStartResult, error) {
	s.startCalls = append(s.startCalls, container)
	if s.startError != nil {
		return client.ContainerStartResult{}, s.startError
	}
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
	if s.stopError != nil {
		return client.ContainerStopResult{}, s.stopError
	}
	for index := range s.containers {
		if s.containers[index].ID == container {
			s.containers[index].State = containerapi.StateExited
			s.containers[index].Status = "Exited"
		}
	}
	return client.ContainerStopResult{}, nil
}

func (s *stubDockerClient) ContainerRemove(_ context.Context, container string, _ client.ContainerRemoveOptions) (client.ContainerRemoveResult, error) {
	s.removeCalls = append(s.removeCalls, container)
	if s.removeError != nil {
		return client.ContainerRemoveResult{}, s.removeError
	}
	next := s.containers[:0]
	for _, item := range s.containers {
		if item.ID != container {
			next = append(next, item)
		}
	}
	s.containers = next
	return client.ContainerRemoveResult{}, nil
}

func (s *stubDockerClient) ImagePull(_ context.Context, ref string, _ client.ImagePullOptions) (client.ImagePullResponse, error) {
	s.pullCalls = append(s.pullCalls, ref)
	if s.pullError != nil {
		return nil, s.pullError
	}
	return stubImagePullResponse{}, nil
}

func (s *stubDockerClient) ContainerLogs(_ context.Context, _ string, _ client.ContainerLogsOptions) (client.ContainerLogsResult, error) {
	if s.logsError != nil {
		return nil, s.logsError
	}
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
	return func(yield func(jsonstreamapi.Message, error) bool) {}
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
	healthServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	t.Cleanup(healthServer.Close)
	return &Manager{
		settings: settings,
		image:    settings.LocalStackImage,
		newClient: func(host string) (dockerClient, error) {
			if host != "unix:///tmp/cloudsprocket-test-docker.sock" {
				t.Fatalf("unexpected Docker host %s", host)
			}
			return stub, nil
		},
		httpClient:     healthServer.Client(),
		healthEndpoint: healthServer.URL + "/_localstack/health",
	}
}

func TestStartCreatesAndStartsManagedContainer(t *testing.T) {
	dockerClient := &stubDockerClient{}
	manager := newTestManager(t, dockerClient)

	status, err := manager.Start(context.Background(), models.LocalStackStartOptions{})
	if err != nil {
		t.Fatalf("expected start to succeed, got %v", err)
	}
	if status.Status != models.EmulatorStatusRunning {
		t.Fatalf("expected running status, got %+v", status)
	}
	if dockerClient.createCalls != 1 {
		t.Fatalf("expected one container create call, got %d", dockerClient.createCalls)
	}
	if len(dockerClient.pullCalls) != 1 || dockerClient.pullCalls[0] != defaultImage {
		t.Fatalf("expected LocalStack image pull, got %+v", dockerClient.pullCalls)
	}
	if len(dockerClient.startCalls) != 1 || dockerClient.startCalls[0] != containerName {
		t.Fatalf("expected start by managed name, got %+v", dockerClient.startCalls)
	}
	if !dockerClient.closeCalled {
		t.Fatalf("expected Docker client to be closed")
	}
}

func TestStartReusesExistingStoppedContainer(t *testing.T) {
	dockerClient := &stubDockerClient{containers: []containerapi.Summary{{
		ID:     "ctr-123",
		Names:  []string{"/" + containerName},
		Image:  defaultImage,
		State:  containerapi.StateExited,
		Status: "Exited",
	}}}
	manager := newTestManager(t, dockerClient)

	status, err := manager.Start(context.Background(), models.LocalStackStartOptions{})
	if err != nil {
		t.Fatalf("expected start to succeed, got %v", err)
	}
	if status.Status != models.EmulatorStatusRunning {
		t.Fatalf("expected running status, got %+v", status)
	}
	if dockerClient.createCalls != 0 || len(dockerClient.pullCalls) != 0 {
		t.Fatalf("expected existing container to be reused, create=%d pulls=%+v", dockerClient.createCalls, dockerClient.pullCalls)
	}
	if len(dockerClient.startCalls) != 1 || dockerClient.startCalls[0] != "ctr-123" {
		t.Fatalf("expected start by existing container id, got %+v", dockerClient.startCalls)
	}
}

func TestStopStopsRunningManagedContainer(t *testing.T) {
	dockerClient := &stubDockerClient{containers: []containerapi.Summary{{
		ID:     "ctr-123",
		Names:  []string{"/" + containerName},
		Image:  defaultImage,
		State:  containerapi.StateRunning,
		Status: "Up 1 second",
	}}}
	manager := newTestManager(t, dockerClient)

	status, err := manager.Stop(context.Background())
	if err != nil {
		t.Fatalf("expected stop to succeed, got %v", err)
	}
	if status.Status != models.EmulatorStatusStopped {
		t.Fatalf("expected stopped status, got %+v", status)
	}
	if len(dockerClient.stopCalls) != 1 || dockerClient.stopCalls[0] != "ctr-123" {
		t.Fatalf("expected stop by container id, got %+v", dockerClient.stopCalls)
	}
}

func TestStartReturnsDockerErrors(t *testing.T) {
	dockerClient := &stubDockerClient{pullError: errors.New("pull failed")}
	manager := newTestManager(t, dockerClient)

	status, err := manager.Start(context.Background(), models.LocalStackStartOptions{})
	if err == nil {
		t.Fatalf("expected start error")
	}
	if status.Status != models.EmulatorStatusNotConfigured || status.Summary == "" {
		t.Fatalf("expected error status, got %+v", status)
	}
}

func TestStartUsesConfiguredImage(t *testing.T) {
	dockerClient := &stubDockerClient{}
	manager := newTestManager(t, dockerClient)
	manager.image = "registry.example.com/localstack:2026.05.0"

	status, err := manager.Start(context.Background(), models.LocalStackStartOptions{})
	if err != nil {
		t.Fatalf("expected start to succeed, got %v", err)
	}
	if status.Image != "registry.example.com/localstack:2026.05.0" {
		t.Fatalf("expected status image to use configured image, got %+v", status)
	}
	if len(dockerClient.pullCalls) != 1 || dockerClient.pullCalls[0] != "registry.example.com/localstack:2026.05.0" {
		t.Fatalf("expected configured image pull, got %+v", dockerClient.pullCalls)
	}
	if dockerClient.containers[0].Image != "registry.example.com/localstack:2026.05.0" {
		t.Fatalf("expected created container to use configured image, got %+v", dockerClient.containers[0])
	}
}

func TestStartReplacesStoppedContainerWithDifferentImage(t *testing.T) {
	dockerClient := &stubDockerClient{containers: []containerapi.Summary{{
		ID:     "ctr-old",
		Names:  []string{"/" + containerName},
		Image:  "localstack/localstack:latest",
		State:  containerapi.StateExited,
		Status: "Exited",
	}}}
	manager := newTestManager(t, dockerClient)

	status, err := manager.Start(context.Background(), models.LocalStackStartOptions{})
	if err != nil {
		t.Fatalf("expected start to succeed, got %v", err)
	}
	if status.Image != defaultImage {
		t.Fatalf("expected replacement container image, got %+v", status)
	}
	if len(dockerClient.removeCalls) != 1 || dockerClient.removeCalls[0] != "ctr-old" {
		t.Fatalf("expected old container to be removed, got %+v", dockerClient.removeCalls)
	}
	if dockerClient.createCalls != 1 {
		t.Fatalf("expected replacement container create, got %d", dockerClient.createCalls)
	}
}

func TestStartPassesLocalStackAuthTokenWhenConfigured(t *testing.T) {
	dockerClient := &stubDockerClient{}
	manager := newTestManager(t, dockerClient)
	manager.image = "localstack/localstack:2026.05.0"

	if _, err := manager.Start(context.Background(), models.LocalStackStartOptions{AuthToken: "test-token"}); err != nil {
		t.Fatalf("expected start to succeed, got %v", err)
	}
	if len(dockerClient.lastCreateEnv) != 1 || dockerClient.lastCreateEnv[0] != "LOCALSTACK_AUTH_TOKEN=test-token" {
		t.Fatalf("expected auth token env to be passed to LocalStack, got %+v", dockerClient.lastCreateEnv)
	}
}

func TestStartRecreatesStoppedContainerWhenAuthTokenProvided(t *testing.T) {
	dockerClient := &stubDockerClient{containers: []containerapi.Summary{{
		ID:     "ctr-stopped",
		Names:  []string{"/" + containerName},
		Image:  defaultImage,
		State:  containerapi.StateExited,
		Status: "Exited",
	}}}
	manager := newTestManager(t, dockerClient)

	if _, err := manager.Start(context.Background(), models.LocalStackStartOptions{AuthToken: "test-token"}); err != nil {
		t.Fatalf("expected start to succeed, got %v", err)
	}
	if len(dockerClient.removeCalls) != 1 || dockerClient.removeCalls[0] != "ctr-stopped" {
		t.Fatalf("expected stopped container to be recreated for token env, got %+v", dockerClient.removeCalls)
	}
	if len(dockerClient.lastCreateEnv) != 1 || dockerClient.lastCreateEnv[0] != "LOCALSTACK_AUTH_TOKEN=test-token" {
		t.Fatalf("expected auth token env on replacement container, got %+v", dockerClient.lastCreateEnv)
	}
}

func TestStartConfiguresPersistenceAndExtraEnvironment(t *testing.T) {
	dockerClient := &stubDockerClient{}
	manager := newTestManager(t, dockerClient)

	_, err := manager.Start(context.Background(), models.LocalStackStartOptions{
		Persistence: true,
		Environment: map[string]string{
			"DEBUG":                 "1",
			"bad-name":              "ignored",
			"LOCALSTACK_AUTH_TOKEN": "ignored",
		},
	})
	if err != nil {
		t.Fatalf("expected start to succeed, got %v", err)
	}
	expectedEnv := []string{"DEBUG=1", "PERSISTENCE=1"}
	if !reflect.DeepEqual(dockerClient.lastCreateEnv, expectedEnv) {
		t.Fatalf("expected persistence env, got %+v", dockerClient.lastCreateEnv)
	}
	if len(dockerClient.lastCreateMounts) != 1 {
		t.Fatalf("expected persistence mount, got %+v", dockerClient.lastCreateMounts)
	}
	if dockerClient.lastCreateMounts[0].Target != "/var/lib/localstack" {
		t.Fatalf("expected LocalStack state mount, got %+v", dockerClient.lastCreateMounts[0])
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
		logsPayload: "Ready.\nServing edge on 4566\n",
	}
	manager := newTestManager(t, dockerClient)

	logs, err := manager.Logs(context.Background(), 200)
	if err != nil {
		t.Fatalf("expected logs to succeed, got %v", err)
	}
	expected := []string{"Ready.", "Serving edge on 4566"}
	if !reflect.DeepEqual(logs.Lines, expected) {
		t.Fatalf("expected log lines, got %+v", logs.Lines)
	}
	if logs.Summary == "" {
		t.Fatalf("expected logs summary")
	}
}

func TestLogsHandlesMissingContainer(t *testing.T) {
	dockerClient := &stubDockerClient{}
	manager := newTestManager(t, dockerClient)

	logs, err := manager.Logs(context.Background(), 200)
	if err != nil {
		t.Fatalf("expected missing container logs to succeed, got %v", err)
	}
	if len(logs.Lines) != 0 || logs.Summary == "" {
		t.Fatalf("expected empty log snapshot, got %+v", logs)
	}
}

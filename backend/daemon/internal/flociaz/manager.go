// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package flociaz

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/netip"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"

	"cloudsprocket/backend/daemon/internal/config"
	"cloudsprocket/backend/daemon/internal/dockerruntime"
	"cloudsprocket/backend/daemon/internal/flociazcompat"
	"cloudsprocket/backend/daemon/internal/models"
	"github.com/moby/moby/api/pkg/stdcopy"
	containerapi "github.com/moby/moby/api/types/container"
	mountapi "github.com/moby/moby/api/types/mount"
	networkapi "github.com/moby/moby/api/types/network"
	"github.com/moby/moby/client"
)

const (
	containerName     = "cloudsprocket-floci-az"
	defaultImage      = "floci/floci-az:latest"
	restPort          = "4577"
	eventHubsPort     = "5672"
	serviceBusPort    = "5673"
	kafkaPort         = "9093"
	managedLabelKey   = "com.cloudsprocket.managed"
	managedLabelValue = "true"
	dockerSocketPath  = "/var/run/docker.sock"
	projectLabelKey   = "com.cloudsprocket.project"
	projectLabelValue = "cloud-sprocket"
)

type dockerClient interface {
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

type dockerClientFactory func(host string) (dockerClient, error)

type Manager struct {
	settings  config.Settings
	image     string
	newClient dockerClientFactory
}

func NewManager(settings config.Settings) *Manager {
	image := strings.TrimSpace(settings.FlociAZImage)
	if image == "" {
		image = defaultImage
	}
	return &Manager{
		settings: settings,
		image:    image,
		newClient: func(host string) (dockerClient, error) {
			return client.New(client.WithHost(host), client.WithAPIVersionNegotiation())
		},
	}
}

func (m *Manager) Status(ctx context.Context) (models.LocalStackStatus, error) {
	api, unavailable, err := m.dockerClient()
	if err != nil {
		return unavailable, nil
	}
	defer api.Close()
	return m.statusWithClient(ctx, api), nil
}

func (m *Manager) Start(ctx context.Context, options models.LocalStackStartOptions) (models.LocalStackStatus, error) {
	api, unavailable, err := m.dockerClient()
	if err != nil {
		return unavailable, err
	}
	defer api.Close()

	containers, err := m.managedContainers(ctx, api)
	if err != nil {
		return m.errorStatus("Failed to query Docker containers: " + err.Error()), err
	}
	if len(containers.Items) > 0 {
		container := containers.Items[0]
		contractStale := m.containerMissingOpenTofuContract(ctx, api, container.ID)
		shouldReplace := options.Recreate || contractStale || container.State == "created" ||
			(container.State != "running" &&
				(container.Image != m.image || options.Persistence || len(options.Environment) > 0))
		if shouldReplace {
			if err := m.removeManagedContainer(ctx, api, container); err != nil {
				return m.errorStatus("Failed to remove floci-az container: " + err.Error()), err
			}
		} else if container.State != "running" {
			if _, err := api.ContainerStart(ctx, container.ID, client.ContainerStartOptions{}); err != nil {
				if removeErr := m.removeManagedContainer(ctx, api, container); removeErr != nil {
					return m.errorStatus("Failed to start floci-az container: " + err.Error()), err
				}
			} else {
				_ = m.waitForReady(ctx, "127.0.0.1:"+restPort)
				return m.statusWithClient(ctx, api), nil
			}
		} else {
			return m.statusWithClient(ctx, api), nil
		}
	}

	if err := m.pullImage(ctx, api); err != nil {
		return m.errorStatus("Failed to pull floci-az image: " + err.Error()), err
	}
	ports, bindings, err := portConfig()
	if err != nil {
		return m.errorStatus("Failed to configure floci-az ports: " + err.Error()), err
	}
	mounts, err := m.containerMounts(options)
	if err != nil {
		return m.errorStatus("Failed to configure floci-az persistence: " + err.Error()), err
	}
	if _, err := api.ContainerCreate(ctx, client.ContainerCreateOptions{
		Name: containerName,
		Config: &containerapi.Config{
			Image:        m.image,
			Env:          flociAZEnv(options),
			ExposedPorts: ports,
			Labels:       managedLabels(),
		},
		HostConfig: &containerapi.HostConfig{
			PortBindings:  bindings,
			Mounts:        mounts,
			RestartPolicy: containerapi.RestartPolicy{Name: containerapi.RestartPolicyDisabled},
		},
	}); err != nil {
		return m.errorStatus("Failed to create floci-az container: " + err.Error()), err
	}
	if _, err := api.ContainerStart(ctx, containerName, client.ContainerStartOptions{}); err != nil {
		return m.errorStatus("Failed to start floci-az container: " + err.Error()), err
	}
	// Wait briefly so the REST/metadata endpoints (and TLS cert) are ready for
	// preflight + tofu plan. Prevents "stuck on planning" races after start.
	_ = m.waitForReady(ctx, "127.0.0.1:"+restPort)
	return m.statusWithClient(ctx, api), nil
}

func (m *Manager) Stop(ctx context.Context) (models.LocalStackStatus, error) {
	api, unavailable, err := m.dockerClient()
	if err != nil {
		return unavailable, err
	}
	defer api.Close()

	containers, err := m.managedContainers(ctx, api)
	if err != nil {
		return m.errorStatus("Failed to query Docker containers: " + err.Error()), err
	}
	if len(containers.Items) == 0 {
		return m.statusWithClient(ctx, api), nil
	}
	container := containers.Items[0]
	if container.State == "running" {
		timeoutSeconds := 10
		if _, err := api.ContainerStop(ctx, container.ID, client.ContainerStopOptions{Timeout: &timeoutSeconds}); err != nil {
			return m.errorStatus("Failed to stop floci-az container: " + err.Error()), err
		}
	}
	return m.statusWithClient(ctx, api), nil
}

func (m *Manager) Logs(ctx context.Context, tail int) (models.EmulatorLogSnapshot, error) {
	api, _, err := m.dockerClient()
	if err != nil {
		return emptyLogs("Docker is not available."), err
	}
	defer api.Close()

	containers, err := m.managedContainers(ctx, api)
	if err != nil {
		return emptyLogs("Failed to query floci-az container: " + err.Error()), err
	}
	if len(containers.Items) == 0 {
		return emptyLogs("No managed floci-az container is present."), nil
	}

	tail = clampLogTail(tail)
	result, err := api.ContainerLogs(ctx, containers.Items[0].ID, client.ContainerLogsOptions{
		ShowStdout: true,
		ShowStderr: true,
		Tail:       strconv.Itoa(tail),
	})
	if err != nil {
		return emptyLogs("Failed to read floci-az logs: " + err.Error()), err
	}
	defer result.Close()

	text, err := readContainerLogs(result)
	if err != nil {
		return emptyLogs("Failed to decode floci-az logs: " + err.Error()), err
	}
	lines := splitLogLines(text)
	return models.EmulatorLogSnapshot{
		EmulatorID: "floci-az",
		Lines:      lines,
		Summary:    fmt.Sprintf("Showing the latest %d floci-az log lines.", len(lines)),
	}, nil
}

func (m *Manager) EnsureManagedConfig() error {
	configDir := filepath.Join(m.settings.LocalConfigDir, "azure")
	if err := os.MkdirAll(configDir, 0o755); err != nil {
		return fmt.Errorf("failed to create local Azure config directory: %w", err)
	}
	content := strings.Join([]string{
		"AZURE_STORAGE_CONNECTION_STRING=" + storageConnectionString(),
		"AZURE_STORAGE_BLOB_ENDPOINT=http://localhost:" + restPort + "/devstoreaccount1",
		"AZURE_STORAGE_QUEUE_ENDPOINT=http://localhost:" + restPort + "/devstoreaccount1",
		"AZURE_STORAGE_TABLE_ENDPOINT=http://localhost:" + restPort + "/devstoreaccount1",
		"AZURE_APP_CONFIGURATION_ENDPOINT=http://localhost:" + restPort,
		"AZURE_KEY_VAULT_ENDPOINT=http://localhost:" + restPort,
		"AZURE_EVENT_HUBS_ENDPOINT=amqp://localhost:" + eventHubsPort,
		"AZURE_SERVICE_BUS_ENDPOINT=amqp://localhost:" + serviceBusPort,
		"",
	}, "\n")
	if err := os.WriteFile(m.localEnvPath(), []byte(content), 0o600); err != nil {
		return fmt.Errorf("failed to write local Azure env file: %w", err)
	}
	return nil
}

func (m *Manager) dockerClient() (dockerClient, models.LocalStackStatus, error) {
	host, _ := dockerruntime.ResolveDockerHost(m.settings)
	if host == "" {
		return nil, models.LocalStackStatus{
			EmulatorID: "floci-az",
			ProviderID: "azure",
			Label:      "floci-az",
			Kind:       "docker",
			Status:     models.EmulatorStatusNotConfigured,
			Summary:    "Docker is not available on this system.",
		}, fmt.Errorf("docker host is not configured")
	}
	api, err := m.newClient(host)
	if err != nil {
		return nil, m.errorStatus("Failed to connect to Docker: " + err.Error()), err
	}
	return api, models.LocalStackStatus{}, nil
}

func (m *Manager) managedContainers(ctx context.Context, api dockerClient) (client.ContainerListResult, error) {
	filters := client.Filters{}
	filters.Add("label", managedLabelKey+"="+managedLabelValue)
	filters.Add("label", projectLabelKey+"="+projectLabelValue)
	filters.Add("name", containerName)
	return api.ContainerList(ctx, client.ContainerListOptions{All: true, Filters: filters})
}

func (m *Manager) statusWithClient(ctx context.Context, api dockerClient) models.LocalStackStatus {
	containers, err := m.managedContainers(ctx, api)
	if err != nil {
		return m.errorStatus("Failed to query Docker containers: " + err.Error())
	}
	configReady := m.managedConfigExists()
	if len(containers.Items) == 0 {
		summary := "floci-az container is not running. Start floci-az to use Azure local endpoints."
		if configReady {
			summary = "floci-az not running, but the managed Azure env file is prepared."
		}
		return models.LocalStackStatus{
			EmulatorID: "floci-az",
			ProviderID: "azure",
			Label:      "floci-az",
			Kind:       "docker",
			Status:     models.EmulatorStatusStopped,
			Summary:    summary,
			Image:      m.image,
			Port:       restPort,
			Endpoint:   "http://localhost:" + restPort,
			ConfigPath: m.localEnvPath(),
			Details: []models.DetailField{
				{Label: "Image", Value: m.image},
				{Label: "REST Endpoint", Value: "http://localhost:" + restPort},
				{Label: "Event Hubs AMQP", Value: "amqp://localhost:" + eventHubsPort},
				{Label: "Service Bus AMQP", Value: "amqp://localhost:" + serviceBusPort},
				{Label: "Kafka", Value: "localhost:" + kafkaPort},
				{Label: "Env File Ready", Value: fmt.Sprintf("%v", configReady)},
			},
		}
	}

	container := containers.Items[0]
	status := models.EmulatorStatusStopped
	summary := "floci-az container is present but not running."
	if container.State == "running" {
		status = models.EmulatorStatusRunning
		summary = "floci-az is running at http://localhost:" + restPort
		if err := tcpHealth(ctx, "127.0.0.1:"+restPort); err != nil {
			status = models.EmulatorStatusUnhealthy
			summary = "floci-az container is running but port check failed: " + err.Error()
		}
	}

	return models.LocalStackStatus{
		EmulatorID:  "floci-az",
		ProviderID:  "azure",
		Label:       "floci-az",
		Kind:        "docker",
		Status:      status,
		Summary:     summary,
		ContainerID: container.ID,
		Image:       container.Image,
		Port:        restPort,
		Endpoint:    "http://localhost:" + restPort,
		ConfigPath:  m.localEnvPath(),
		Details: []models.DetailField{
			{Label: "Container ID", Value: truncateID(container.ID)},
			{Label: "Image", Value: container.Image},
			{Label: "State", Value: string(container.State)},
			{Label: "Status", Value: container.Status},
			{Label: "REST Endpoint", Value: "http://localhost:" + restPort},
			{Label: "Event Hubs AMQP", Value: "amqp://localhost:" + eventHubsPort},
			{Label: "Service Bus AMQP", Value: "amqp://localhost:" + serviceBusPort},
			{Label: "Env File", Value: m.localEnvPath()},
		},
	}
}

func (m *Manager) errorStatus(summary string) models.LocalStackStatus {
	return models.LocalStackStatus{
		EmulatorID: "floci-az",
		ProviderID: "azure",
		Label:      "floci-az",
		Kind:       "docker",
		Status:     models.EmulatorStatusNotConfigured,
		Summary:    summary,
		Image:      m.image,
	}
}

func (m *Manager) containerMissingOpenTofuContract(ctx context.Context, api dockerClient, containerID string) bool {
	inspect, err := api.ContainerInspect(ctx, containerID, client.ContainerInspectOptions{})
	if err != nil {
		return false
	}
	if inspect.Container.Config == nil {
		return false
	}
	return !flociazcompat.ContainerHasOpenTofuContract(inspect.Container.Config.Env)
}

func (m *Manager) pullImage(ctx context.Context, api dockerClient) error {
	response, err := api.ImagePull(ctx, m.image, client.ImagePullOptions{})
	if err != nil {
		return err
	}
	defer response.Close()
	return response.Wait(ctx)
}

func portConfig() (networkapi.PortSet, networkapi.PortMap, error) {
	ports := networkapi.PortSet{}
	bindings := networkapi.PortMap{}
	hostIP := netip.MustParseAddr("127.0.0.1")
	for _, value := range []string{restPort, eventHubsPort, serviceBusPort, kafkaPort} {
		port, err := networkapi.ParsePort(value + "/tcp")
		if err != nil {
			return nil, nil, err
		}
		ports[port] = struct{}{}
		bindings[port] = []networkapi.PortBinding{{HostIP: hostIP, HostPort: value}}
	}
	return ports, bindings, nil
}

func flociAZEnv(options models.LocalStackStartOptions) []string {
	values := flociazcompat.DefaultContainerEnvironment()
	for key, value := range options.Environment {
		if validEnvName(key) && !isProtectedFlociAZEnvKey(key) {
			values[key] = value
		}
	}
	if options.Persistence {
		values["FLOCI_AZ_STORAGE_MODE"] = "persistent"
		values["FLOCI_AZ_STORAGE_PATH"] = "/app/data"
	}
	if len(values) == 0 {
		return nil
	}
	keys := make([]string, 0, len(values))
	for key := range values {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	env := make([]string, 0, len(keys))
	for _, key := range keys {
		env = append(env, key+"="+values[key])
	}
	return env
}

// isProtectedFlociAZEnvKey reports whether key is part of the OpenTofu
// compatibility contract (see flociazcompat.DefaultContainerEnvironment) or the
// storage configuration, neither of which a user-supplied env file may
// override. Without this, a custom env value that doesn't match the contract
// causes ContainerHasOpenTofuContract to flag the container as stale on every
// Start(), triggering a recreation loop that reapplies the same value.
func isProtectedFlociAZEnvKey(key string) bool {
	switch key {
	case "FLOCI_AZ_TLS_ENABLED", "FLOCI_AZ_HOSTNAME", "FLOCI_AZ_SERVICES_AKS_MOCKED",
		"FLOCI_AZ_STORAGE_MODE", "FLOCI_AZ_STORAGE_PATH":
		return true
	default:
		return false
	}
}

func (m *Manager) containerMounts(options models.LocalStackStartOptions) ([]mountapi.Mount, error) {
	// floci-az runs docker-backed services (PostgreSQL Flexible Server, Redis,
	// ACR, AKS) by spawning sibling Docker containers, which requires the host
	// Docker socket mounted into the container. Without it, e.g. PostgreSQL
	// create fails with "ContainerStartFailed". This mirrors the LocalStack
	// manager; on Docker Desktop (Windows/macOS) the named pipe is exposed at
	// this path.
	mounts := []mountapi.Mount{{
		Type:   mountapi.TypeBind,
		Source: dockerSocketPath,
		Target: dockerSocketPath,
	}}
	if options.Persistence {
		stateDir := filepath.Join(m.settings.EmulatorStateDir, "floci-az")
		if err := os.MkdirAll(stateDir, 0o755); err != nil {
			return nil, err
		}
		mounts = append(mounts, mountapi.Mount{Type: mountapi.TypeBind, Source: stateDir, Target: "/app/data"})
	}
	return mounts, nil
}

func (m *Manager) localEnvPath() string {
	return filepath.Join(m.settings.LocalConfigDir, "azure", "floci-az.env")
}

func (m *Manager) managedConfigExists() bool {
	_, err := os.Stat(m.localEnvPath())
	return err == nil
}

func emptyLogs(summary string) models.EmulatorLogSnapshot {
	return models.EmulatorLogSnapshot{EmulatorID: "floci-az", Lines: []string{}, Summary: summary}
}

func storageConnectionString() string {
	key := "Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw=="
	return "DefaultEndpointsProtocol=http;AccountName=devstoreaccount1;AccountKey=" + key +
		";BlobEndpoint=http://localhost:" + restPort + "/devstoreaccount1" +
		";QueueEndpoint=http://localhost:" + restPort + "/devstoreaccount1" +
		";TableEndpoint=http://localhost:" + restPort + "/devstoreaccount1;"
}

func validEnvName(value string) bool {
	if value == "" {
		return false
	}
	for index, r := range value {
		if (r >= 'A' && r <= 'Z') || (r >= 'a' && r <= 'z') || r == '_' || (index > 0 && r >= '0' && r <= '9') {
			continue
		}
		return false
	}
	return true
}

func clampLogTail(tail int) int {
	if tail <= 0 {
		return 200
	}
	if tail > 1000 {
		return 1000
	}
	return tail
}

func readContainerLogs(result client.ContainerLogsResult) (string, error) {
	raw, err := io.ReadAll(result)
	if err != nil {
		return "", err
	}
	var stdout bytes.Buffer
	var stderr bytes.Buffer
	if _, err := stdcopy.StdCopy(&stdout, &stderr, bytes.NewReader(raw)); err == nil {
		if stderr.Len() == 0 {
			return stdout.String(), nil
		}
		if stdout.Len() == 0 {
			return stderr.String(), nil
		}
		return stdout.String() + stderr.String(), nil
	}
	return string(raw), nil
}

func splitLogLines(text string) []string {
	text = strings.ReplaceAll(text, "\r\n", "\n")
	text = strings.TrimSpace(text)
	if text == "" {
		return []string{}
	}
	lines := strings.Split(text, "\n")
	for index := range lines {
		lines[index] = strings.TrimRight(lines[index], "\r")
	}
	return lines
}

func tcpHealth(ctx context.Context, address string) error {
	dialer := net.Dialer{Timeout: 800 * time.Millisecond}
	conn, err := dialer.DialContext(ctx, "tcp", address)
	if err != nil {
		return err
	}
	return conn.Close()
}

// waitForReady polls the TCP port (and a lightweight metadata probe) after
// container start. This makes Start() return only when floci-az is actually
// usable for tofu preflight/plan, avoiding apparent "stuck on planning" when
// the user immediately plans an Azure lab after starting the runtime.
func (m *Manager) waitForReady(ctx context.Context, address string) error {
	deadline := time.Now().Add(15 * time.Second)
	for time.Now().Before(deadline) {
		select {
		case <-ctx.Done():
			return ctx.Err()
		default:
		}
		if err := tcpHealth(ctx, address); err == nil {
			// Best-effort metadata probe (non-fatal if slow).
			probeCtx, cancel := context.WithTimeout(ctx, 800*time.Millisecond)
			url := "http://" + address + "/metadata/endpoints?api-version=2022-09-01"
			req, _ := http.NewRequestWithContext(probeCtx, http.MethodGet, url, nil)
			if resp, err := http.DefaultClient.Do(req); err == nil {
				resp.Body.Close()
				cancel()
				return nil
			}
			cancel()
		}
		time.Sleep(250 * time.Millisecond)
	}
	return nil
}

func truncateID(id string) string {
	if len(id) > 12 {
		return id[:12]
	}
	return id
}

func (m *Manager) removeManagedContainer(ctx context.Context, api dockerClient, container containerapi.Summary) error {
	if container.State == "running" {
		timeoutSeconds := 10
		if _, err := api.ContainerStop(ctx, container.ID, client.ContainerStopOptions{Timeout: &timeoutSeconds}); err != nil {
			return err
		}
	}
	_, err := api.ContainerRemove(ctx, container.ID, client.ContainerRemoveOptions{Force: true})
	return err
}

func managedLabels() map[string]string {
	return map[string]string{managedLabelKey: managedLabelValue, projectLabelKey: projectLabelValue}
}

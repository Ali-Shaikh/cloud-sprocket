// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package localstack

import (
	"context"
	"fmt"
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
	"cloudsprocket/backend/daemon/internal/emulatordocker"
	"cloudsprocket/backend/daemon/internal/models"
	containerapi "github.com/moby/moby/api/types/container"
	mountapi "github.com/moby/moby/api/types/mount"
	networkapi "github.com/moby/moby/api/types/network"
	"github.com/moby/moby/client"
)

const (
	containerName     = "cloudsprocket-localstack"
	defaultImage      = "localstack/localstack:stable"
	containerPort     = "4566"
	containerPortSpec = "4566/tcp"
	// LocalStack allocates RDS Postgres listeners inside this range; publish it
	// to the host so developers can connect with psql or a desktop SQL client.
	rdsPortStart                = 4510
	rdsPortEnd                  = 4559
	profileName                 = "cloudsprocket-localstack"
	managedLabelKey             = "com.cloudsprocket.managed"
	managedLabelValue           = "true"
	projectLabelKey             = "com.cloudsprocket.project"
	projectLabelValue           = "cloud-sprocket"
	localStackConfigKey         = "com.cloudsprocket.localstack.config"
	localStackConfigValue       = "persist-volume-v1"
	localStackPersistenceVolume = "cloudsprocket-localstack-data"
	dockerSocketPath            = "/var/run/docker.sock"
)

// Manager handles LocalStack emulator status and managed AWS profile creation.
type Manager struct {
	settings       config.Settings
	image          string
	newClient      emulatordocker.ClientFactory
	httpClient     *http.Client
	healthEndpoint string
}

func NewManager(settings config.Settings) *Manager {
	image := settings.LocalStackImage
	if image == "" {
		image = defaultImage
	}
	return &Manager{
		settings:       settings,
		image:          image,
		newClient:      emulatordocker.DefaultClientFactory,
		httpClient:     &http.Client{Timeout: 800 * time.Millisecond},
		healthEndpoint: "http://localhost:" + containerPort + "/_localstack/health",
	}
}

// Status returns the current LocalStack emulator status.
func (m *Manager) Status(ctx context.Context) (models.EmulatorStatusDetail, error) {
	api, unavailable, err := m.dockerClient()
	if err != nil {
		return unavailable, nil
	}
	defer api.Close()

	return m.statusWithClient(ctx, api), nil
}

// Start ensures the managed LocalStack container exists and is running.
func (m *Manager) Start(ctx context.Context, options models.EmulatorStartOptions) (models.EmulatorStatusDetail, error) {
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
		if options.Recreate || needsLocalStackRecreate(container) || container.State == "created" {
			if err := emulatordocker.RemoveManagedContainer(ctx, api, container); err != nil {
				return m.errorStatus("Failed to remove LocalStack container: " + err.Error()), err
			}
		} else if container.State != "running" {
			if _, err := api.ContainerStart(ctx, container.ID, client.ContainerStartOptions{}); err != nil {
				if removeErr := emulatordocker.RemoveManagedContainer(ctx, api, container); removeErr != nil {
					return m.errorStatus("Failed to start LocalStack container: " + err.Error()), err
				}
			} else {
				return m.statusWithClient(ctx, api), nil
			}
		} else {
			return m.statusWithClient(ctx, api), nil
		}
	}

	if err := m.pullImage(ctx, api); err != nil {
		return m.errorStatus("Failed to pull LocalStack image: " + err.Error()), err
	}

	exposedPorts, portBindings, err := localStackPortConfig()
	if err != nil {
		return m.errorStatus("Failed to configure LocalStack ports: " + err.Error()), err
	}
	mounts, err := m.containerMounts(options)
	if err != nil {
		return m.errorStatus("Failed to configure LocalStack persistence: " + err.Error()), err
	}
	_, err = api.ContainerCreate(ctx, client.ContainerCreateOptions{
		Name: containerName,
		Config: &containerapi.Config{
			Image:        m.image,
			Env:          localStackEnv(options),
			ExposedPorts: exposedPorts,
			Labels:       managedLabels(),
		},
		HostConfig: &containerapi.HostConfig{
			PortBindings:  portBindings,
			Mounts:        mounts,
			RestartPolicy: containerapi.RestartPolicy{Name: containerapi.RestartPolicyDisabled},
		},
	})
	if err != nil {
		return m.errorStatus("Failed to create LocalStack container: " + err.Error()), err
	}
	if _, err := api.ContainerStart(ctx, containerName, client.ContainerStartOptions{}); err != nil {
		return m.errorStatus("Failed to start LocalStack container: " + err.Error()), err
	}
	return m.statusWithClient(ctx, api), nil
}

// Stop stops the managed LocalStack container if it exists.
func (m *Manager) Stop(ctx context.Context) (models.EmulatorStatusDetail, error) {
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
			return m.errorStatus("Failed to stop LocalStack container: " + err.Error()), err
		}
	}
	return m.statusWithClient(ctx, api), nil
}

// Logs returns recent logs for the managed LocalStack container.
func (m *Manager) Logs(ctx context.Context, tail int) (models.EmulatorLogSnapshot, error) {
	api, _, err := m.dockerClient()
	if err != nil {
		return models.EmulatorLogSnapshot{
			EmulatorID: "localstack",
			Lines:      []string{},
			Summary:    "Docker is not available.",
		}, err
	}
	defer api.Close()

	containers, err := m.managedContainers(ctx, api)
	if err != nil {
		return models.EmulatorLogSnapshot{
			EmulatorID: "localstack",
			Lines:      []string{},
			Summary:    "Failed to query LocalStack container: " + err.Error(),
		}, err
	}
	if len(containers.Items) == 0 {
		return models.EmulatorLogSnapshot{
			EmulatorID: "localstack",
			Lines:      []string{},
			Summary:    "No managed LocalStack container is present.",
		}, nil
	}

	tail = emulatordocker.ClampLogTail(tail)
	result, err := api.ContainerLogs(ctx, containers.Items[0].ID, client.ContainerLogsOptions{
		ShowStdout: true,
		ShowStderr: true,
		Tail:       strconv.Itoa(tail),
	})
	if err != nil {
		return models.EmulatorLogSnapshot{
			EmulatorID: "localstack",
			Lines:      []string{},
			Summary:    "Failed to read LocalStack logs: " + err.Error(),
		}, err
	}
	defer result.Close()

	text, err := emulatordocker.ReadContainerLogs(result)
	if err != nil {
		return models.EmulatorLogSnapshot{
			EmulatorID: "localstack",
			Lines:      []string{},
			Summary:    "Failed to decode LocalStack logs: " + err.Error(),
		}, err
	}
	lines := emulatordocker.SplitLogLines(text)
	return models.EmulatorLogSnapshot{
		EmulatorID: "localstack",
		Lines:      lines,
		Summary:    fmt.Sprintf("Showing the latest %d LocalStack log lines.", len(lines)),
	}, nil
}

func (m *Manager) dockerClient() (emulatordocker.DockerClient, models.EmulatorStatusDetail, error) {
	host, _ := dockerruntime.ResolveDockerHost(m.settings)
	if host == "" {
		return nil, models.EmulatorStatusDetail{
			EmulatorID: "localstack",
			ProviderID: "aws",
			Label:      "LocalStack",
			Kind:       "docker",
			Status:     models.EmulatorStatusNotConfigured,
			Summary:    "Docker is not available on this system.",
		}, fmt.Errorf("docker host is not configured")
	}

	api, err := m.newClient(host)
	if err != nil {
		return nil, m.errorStatus("Failed to connect to Docker: " + err.Error()), err
	}
	return api, models.EmulatorStatusDetail{}, nil
}

func (m *Manager) managedContainers(ctx context.Context, api emulatordocker.DockerClient) (client.ContainerListResult, error) {
	filters := client.Filters{}
	filters.Add("label", managedLabelKey+"="+managedLabelValue)
	filters.Add("label", projectLabelKey+"="+projectLabelValue)
	filters.Add("name", containerName)
	return api.ContainerList(ctx, client.ContainerListOptions{All: true, Filters: filters})
}

func (m *Manager) statusWithClient(ctx context.Context, api emulatordocker.DockerClient) models.EmulatorStatusDetail {
	containers, err := m.managedContainers(ctx, api)
	if err != nil {
		return m.errorStatus("Failed to query Docker containers: " + err.Error())
	}

	if len(containers.Items) == 0 {
		// Check if managed profile exists
		configExists := m.managedProfileExists("config")
		credsExists := m.managedProfileExists("credentials")
		profileReady := configExists && credsExists

		status := models.EmulatorStatusStopped
		summary := "LocalStack container is not running. Start LocalStack manually at http://localhost:4566."
		if profileReady {
			summary = "LocalStack not running, but managed profile is prepared. Start LocalStack to use it."
		}

		return models.EmulatorStatusDetail{
			EmulatorID:  "localstack",
			ProviderID:  "aws",
			Label:       "LocalStack",
			Kind:        "docker",
			Status:      status,
			Summary:     summary,
			ProfileName: profileName,
			ConfigPath:  m.localConfigPath("config"),
			CredsPath:   m.localConfigPath("credentials"),
			Details: []models.DetailField{
				{Label: "Image", Value: m.image},
				{Label: "Port", Value: containerPort},
				{Label: "Endpoint", Value: "http://localhost:" + containerPort},
				{Label: "Managed Profile", Value: profileName},
				{Label: "Profile Ready", Value: fmt.Sprintf("%v", profileReady)},
			},
		}
	}

	// Container exists - check state
	container := containers.Items[0]
	running := container.State == "running"
	status := models.EmulatorStatusStopped
	summary := "LocalStack container is present but not running."
	if running {
		status = models.EmulatorStatusRunning
		summary = "LocalStack is running at http://localhost:4566"
		if err := m.healthCheck(ctx); err != nil {
			status = models.EmulatorStatusUnhealthy
			summary = "LocalStack container is running but health check failed: " + err.Error()
		}
	}

	return models.EmulatorStatusDetail{
		EmulatorID:  "localstack",
		ProviderID:  "aws",
		Label:       "LocalStack",
		Kind:        "docker",
		Status:      status,
		Summary:     summary,
		ContainerID: container.ID,
		Image:       container.Image,
		Port:        containerPort,
		Endpoint:    "http://localhost:" + containerPort,
		ProfileName: profileName,
		ConfigPath:  m.localConfigPath("config"),
		CredsPath:   m.localConfigPath("credentials"),
		Details: []models.DetailField{
			{Label: "Container ID", Value: emulatordocker.TruncateID(container.ID)},
			{Label: "Image", Value: container.Image},
			{Label: "State", Value: container.Status},
			{Label: "Status", Value: container.Status},
			{Label: "Endpoint", Value: "http://localhost:" + containerPort},
			{Label: "Managed Profile", Value: profileName},
		},
	}
}

func (m *Manager) errorStatus(summary string) models.EmulatorStatusDetail {
	return models.EmulatorStatusDetail{
		EmulatorID: "localstack",
		ProviderID: "aws",
		Label:      "LocalStack",
		Kind:       "docker",
		Status:     models.EmulatorStatusNotConfigured,
		Summary:    summary,
	}
}

func (m *Manager) pullImage(ctx context.Context, api emulatordocker.DockerClient) error {
	response, err := api.ImagePull(ctx, m.image, client.ImagePullOptions{})
	if err != nil {
		return err
	}
	defer response.Close()
	return response.Wait(ctx)
}

func localStackEnv(options models.EmulatorStartOptions) []string {
	values := map[string]string{}
	for key, value := range options.Environment {
		if emulatordocker.ValidEnvName(key) && key != "LOCALSTACK_AUTH_TOKEN" && key != "PERSISTENCE" {
			values[key] = value
		}
	}
	if options.Persistence {
		values["PERSISTENCE"] = "1"
	}
	if token := strings.TrimSpace(options.AuthToken); token != "" {
		values["LOCALSTACK_AUTH_TOKEN"] = token
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

func (m *Manager) containerMounts(options models.EmulatorStartOptions) ([]mountapi.Mount, error) {
	// LocalStack runs Lambda (and other compute) by spawning sibling Docker
	// containers, which requires the host Docker socket mounted into the
	// container. Without this, Lambda creation fails with "Docker not available".
	// On Docker Desktop (Windows/macOS) the named pipe is exposed at this path.
	mounts := []mountapi.Mount{{
		Type:   mountapi.TypeBind,
		Source: dockerSocketPath,
		Target: dockerSocketPath,
	}}
	if options.Persistence {
		stateMount, err := m.persistenceMount()
		if err != nil {
			return nil, err
		}
		mounts = append(mounts, stateMount)
	}
	return mounts, nil
}

func (m *Manager) persistenceMount() (mountapi.Mount, error) {
	// Docker Desktop bind mounts from Windows/macOS hosts break Postgres RDS data
	// directory permissions inside LocalStack. Use a named Docker volume there.
	if m.settings.PlatformName == "linux" {
		stateDir := filepath.Join(m.settings.EmulatorStateDir, "localstack")
		if err := os.MkdirAll(stateDir, 0o755); err != nil {
			return mountapi.Mount{}, err
		}
		return mountapi.Mount{
			Type:   mountapi.TypeBind,
			Source: stateDir,
			Target: "/var/lib/localstack",
		}, nil
	}
	return mountapi.Mount{
		Type:   mountapi.TypeVolume,
		Source: localStackPersistenceVolume,
		Target: "/var/lib/localstack",
	}, nil
}

func (m *Manager) healthCheck(ctx context.Context) error {
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, m.healthEndpoint, nil)
	if err != nil {
		return err
	}
	response, err := m.httpClient.Do(request)
	if err != nil {
		return err
	}
	defer response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return fmt.Errorf("health endpoint returned HTTP %d", response.StatusCode)
	}
	return nil
}

// EnsureManagedProfile creates the app-managed AWS config and credentials files for LocalStack.
func (m *Manager) EnsureManagedProfile() error {
	localAWSConfigDir := m.localAWSConfigDir()
	if err := os.MkdirAll(localAWSConfigDir, 0o755); err != nil {
		return fmt.Errorf("failed to create local AWS config directory: %w", err)
	}

	// Write config file with endpoint_url
	configPath := m.localConfigPath("config")
	configContent := fmt.Sprintf(`[profile %s]
region = us-east-1
endpoint_url = http://localhost:%s
cloudsprocket_allow_writes = true
`, profileName, containerPort)

	if err := os.WriteFile(configPath, []byte(configContent), 0o644); err != nil {
		return fmt.Errorf("failed to write local AWS config: %w", err)
	}

	// Write credentials file with dummy keys
	credsPath := m.localConfigPath("credentials")
	credsContent := fmt.Sprintf(`[%s]
aws_access_key_id = test
aws_secret_access_key = test
`, profileName)

	if err := os.WriteFile(credsPath, []byte(credsContent), 0o600); err != nil {
		return fmt.Errorf("failed to write local AWS credentials: %w", err)
	}

	return nil
}

func (m *Manager) managedProfileExists(name string) bool {
	_, err := os.Stat(m.localConfigPath(name))
	return err == nil
}

func (m *Manager) localAWSConfigDir() string {
	return filepath.Join(m.settings.LocalConfigDir, "aws")
}

func (m *Manager) localConfigPath(name string) string {
	return filepath.Join(m.localAWSConfigDir(), name)
}

func managedLabels() map[string]string {
	return map[string]string{
		managedLabelKey:     managedLabelValue,
		projectLabelKey:     projectLabelValue,
		localStackConfigKey: localStackConfigValue,
	}
}

func needsLocalStackRecreate(container containerapi.Summary) bool {
	if container.State != "running" {
		return true
	}
	if container.Labels == nil {
		return true
	}
	return container.Labels[localStackConfigKey] != localStackConfigValue
}

func localStackPortConfig() (networkapi.PortSet, networkapi.PortMap, error) {
	hostIP := netip.MustParseAddr("127.0.0.1")
	exposed := networkapi.PortSet{}
	bindings := networkapi.PortMap{}

	gateway, err := networkapi.ParsePort(containerPortSpec)
	if err != nil {
		return nil, nil, err
	}
	exposed[gateway] = struct{}{}
	bindings[gateway] = []networkapi.PortBinding{{
		HostIP:   hostIP,
		HostPort: containerPort,
	}}

	for port := rdsPortStart; port <= rdsPortEnd; port++ {
		spec, err := networkapi.ParsePort(strconv.Itoa(port) + "/tcp")
		if err != nil {
			return nil, nil, err
		}
		exposed[spec] = struct{}{}
		portText := strconv.Itoa(port)
		bindings[spec] = []networkapi.PortBinding{{
			HostIP:   hostIP,
			HostPort: portText,
		}}
	}
	return exposed, bindings, nil
}

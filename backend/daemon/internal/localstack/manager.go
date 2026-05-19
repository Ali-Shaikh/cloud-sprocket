package localstack

import (
	"context"
	"fmt"
	"os"

	"cloudsprocket/backend/daemon/internal/config"
	"cloudsprocket/backend/daemon/internal/dockerruntime"
	"cloudsprocket/backend/daemon/internal/models"
	"github.com/moby/moby/client"
)

const (
	containerName     = "cloudsprocket-localstack"
	containerImage    = "localstack/localstack:latest"
	containerPort     = "4566"
	profileName       = "cloudsprocket-localstack"
	managedLabelKey   = "com.cloudsprocket.managed"
	managedLabelValue = "true"
	projectLabelKey   = "com.cloudsprocket.project"
	projectLabelValue = "cloud-sprocket"
)

// Manager handles LocalStack emulator status and managed AWS profile creation.
type Manager struct {
	settings config.Settings
}

func NewManager(settings config.Settings) *Manager {
	return &Manager{settings: settings}
}

// Status returns the current LocalStack emulator status.
func (m *Manager) Status(ctx context.Context) (models.LocalStackStatus, error) {
	host, _ := dockerruntime.ResolveDockerHost(m.settings)
	if host == "" {
		return models.LocalStackStatus{
			EmulatorID: "localstack",
			ProviderID: "aws",
			Label:      "LocalStack",
			Kind:       "docker",
			Status:     models.EmulatorStatusNotConfigured,
			Summary:    "Docker is not available on this system.",
		}, nil
	}

	api, err := client.New(client.WithHost(host), client.WithAPIVersionNegotiation())
	if err != nil {
		return models.LocalStackStatus{
			EmulatorID: "localstack",
			ProviderID: "aws",
			Label:      "LocalStack",
			Kind:       "docker",
			Status:     models.EmulatorStatusNotConfigured,
			Summary:    "Failed to connect to Docker: " + err.Error(),
		}, nil
	}
	defer api.Close()

	filters := client.Filters{}
	filters.Add("label", managedLabelKey+"="+managedLabelValue)
	filters.Add("label", projectLabelKey+"="+projectLabelValue)

	containers, err := api.ContainerList(ctx, client.ContainerListOptions{All: true, Filters: filters})
	if err != nil {
		return models.LocalStackStatus{
			EmulatorID: "localstack",
			ProviderID: "aws",
			Label:      "LocalStack",
			Kind:       "docker",
			Status:     models.EmulatorStatusNotConfigured,
			Summary:    "Failed to query Docker containers: " + err.Error(),
		}, nil
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

		return models.LocalStackStatus{
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
				{Label: "Image", Value: containerImage},
				{Label: "Port", Value: containerPort},
				{Label: "Endpoint", Value: "http://localhost:" + containerPort},
				{Label: "Managed Profile", Value: profileName},
				{Label: "Profile Ready", Value: fmt.Sprintf("%v", profileReady)},
			},
		}, nil
	}

	// Container exists - check state
	container := containers.Items[0]
	running := container.State == "running"
	status := models.EmulatorStatusStopped
	summary := "LocalStack container is present but not running."
	if running {
		status = models.EmulatorStatusRunning
		summary = "LocalStack is running at http://localhost:4566"
	}

	return models.LocalStackStatus{
		EmulatorID:   "localstack",
		ProviderID:   "aws",
		Label:        "LocalStack",
		Kind:         "docker",
		Status:       status,
		Summary:      summary,
		ContainerID:  container.ID,
		Image:        container.Image,
		Port:         containerPort,
		Endpoint:     "http://localhost:" + containerPort,
		ProfileName:  profileName,
		ConfigPath:   m.localConfigPath("config"),
		CredsPath:    m.localConfigPath("credentials"),
		Details: []models.DetailField{
			{Label: "Container ID", Value: truncateID(container.ID)},
			{Label: "Image", Value: container.Image},
			{Label: "State", Value: container.Status},
			{Label: "Status", Value: container.Status},
			{Label: "Endpoint", Value: "http://localhost:" + containerPort},
			{Label: "Managed Profile", Value: profileName},
		},
	}, nil
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
	return m.settings.LocalConfigDir + "/aws"
}

func (m *Manager) localConfigPath(name string) string {
	return m.localAWSConfigDir() + "/" + name
}

func truncateID(id string) string {
	if len(id) > 12 {
		return id[:12]
	}
	return id
}

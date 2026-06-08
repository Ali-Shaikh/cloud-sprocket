package dockerruntime

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"cloudsprocket/backend/daemon/internal/config"
	"cloudsprocket/backend/daemon/internal/models"
	containerapi "github.com/moby/moby/api/types/container"
	networkapi "github.com/moby/moby/api/types/network"
	volumeapi "github.com/moby/moby/api/types/volume"
	"github.com/moby/moby/client"
)

const (
	managedLabelKey   = "com.cloudsprocket.managed"
	managedLabelValue = "true"
	projectLabelKey   = "com.cloudsprocket.project"
	projectLabelValue = "cloud-sprocket"
)

type Runtime struct {
	settings  config.Settings
	newClient clientFactory
}

func New(settings config.Settings) *Runtime {
	return &Runtime{
		settings:  settings,
		newClient: defaultClientFactory,
	}
}

func (r *Runtime) Snapshot(ctx context.Context) (models.DockerRuntimeSnapshot, error) {
	host, source := ResolveDockerHost(r.settings)
	snapshot := models.DockerRuntimeSnapshot{
		Reachable:   false,
		Host:        host,
		HostSource:  source,
		ContextName: strings.TrimSpace(os.Getenv("DOCKER_CONTEXT")),
		EngineName:  "docker",
		ResourceOwnership: models.DockerOwnershipPolicy{
			LabelKey:        managedLabelKey,
			LabelValue:      managedLabelValue,
			ProjectLabelKey: projectLabelKey,
			ProjectName:     projectLabelValue,
			Summary:         "Only CloudSprocket-managed Docker resources are eligible for future lifecycle control.",
		},
		Summary: "Docker engine endpoint is not currently reachable.",
		Details: []models.DetailField{
			{Label: "Host Source", Value: firstNonEmpty(source, "Not detected")},
			{Label: "Host", Value: firstNonEmpty(host, "Not detected")},
			{Label: "Context", Value: firstNonEmpty(strings.TrimSpace(os.Getenv("DOCKER_CONTEXT")), "Default context")},
		},
	}
	if host == "" {
		snapshot.Summary = "Docker host was not detected. Set `DOCKER_HOST` or start a supported local Docker runtime."
		return snapshot, nil
	}

	api, err := r.newClient(host)
	if err != nil {
		snapshot.Summary = fmt.Sprintf("Docker client initialisation failed: %v", err)
		snapshot.Details = append(snapshot.Details, models.DetailField{Label: "Client Error", Value: err.Error()})
		return snapshot, nil
	}
	defer api.Close()

	ping, err := api.Ping(ctx, client.PingOptions{})
	if err != nil {
		if errors.Is(err, context.DeadlineExceeded) {
			snapshot.Summary = "Docker did not respond in time. The engine may be starting or asleep. Use Refresh Docker to retry."
		} else {
			snapshot.Summary = fmt.Sprintf("Docker engine is configured but unreachable: %v", err)
		}
		snapshot.Details = append(snapshot.Details, models.DetailField{Label: "Connection Error", Value: err.Error()})
		return snapshot, nil
	}

	version, err := api.ServerVersion(ctx, client.ServerVersionOptions{})
	if err != nil {
		snapshot.Summary = fmt.Sprintf("Docker engine responded to ping, but version lookup failed: %v", err)
		snapshot.Details = append(snapshot.Details, models.DetailField{Label: "Version Error", Value: err.Error()})
		return snapshot, nil
	}

	info, err := api.Info(ctx, client.InfoOptions{})
	if err != nil {
		snapshot.Summary = fmt.Sprintf("Docker engine responded to ping, but info lookup failed: %v", err)
		snapshot.Details = append(snapshot.Details, models.DetailField{Label: "Info Error", Value: err.Error()})
		return snapshot, nil
	}

	snapshot.Reachable = true
	snapshot.ServerVersion = version.Version
	snapshot.APIVersion = firstNonEmpty(version.APIVersion, ping.APIVersion)
	snapshot.OperatingSystem = firstNonEmpty(info.Info.OperatingSystem, version.Platform.Name, version.Os, ping.OSType)
	snapshot.Architecture = firstNonEmpty(info.Info.Architecture, version.Arch)
	snapshot.Summary = "Docker engine is reachable and ready for managed runtime operations."
	snapshot.Details = append(snapshot.Details,
		models.DetailField{Label: "Server Version", Value: firstNonEmpty(snapshot.ServerVersion, "Unavailable")},
		models.DetailField{Label: "API Version", Value: firstNonEmpty(snapshot.APIVersion, "Unavailable")},
		models.DetailField{Label: "Operating System", Value: firstNonEmpty(snapshot.OperatingSystem, "Unavailable")},
		models.DetailField{Label: "Architecture", Value: firstNonEmpty(snapshot.Architecture, "Unavailable")},
		models.DetailField{Label: "Docker Root", Value: firstNonEmpty(info.Info.DockerRootDir, "Unavailable")},
	)

	return snapshot, nil
}

func (r *Runtime) ListOwnedResources(ctx context.Context) ([]models.ManagedDockerResource, error) {
	host, _ := ResolveDockerHost(r.settings)
	if host == "" {
		return []models.ManagedDockerResource{}, nil
	}

	api, err := r.newClient(host)
	if err != nil {
		return []models.ManagedDockerResource{}, nil
	}
	defer api.Close()

	filters := client.Filters{}
	filters = filters.Add("label", managedLabelKey+"="+managedLabelValue)
	filters = filters.Add("label", projectLabelKey+"="+projectLabelValue)

	resources := []models.ManagedDockerResource{}

	containers, err := api.ContainerList(ctx, client.ContainerListOptions{All: true, Filters: filters})
	if err == nil {
		for _, item := range containers.Items {
			resources = append(resources, mapContainer(item))
		}
	}

	networks, err := api.NetworkList(ctx, client.NetworkListOptions{Filters: filters})
	if err == nil {
		for _, item := range networks.Items {
			resources = append(resources, mapNetwork(item))
		}
	}

	volumes, err := api.VolumeList(ctx, client.VolumeListOptions{Filters: filters})
	if err == nil {
		for _, item := range volumes.Items {
			resources = append(resources, mapVolume(item))
		}
	}

	return resources, nil
}

func ResolveDockerHost(settings config.Settings) (string, string) {
	if host := strings.TrimSpace(os.Getenv("DOCKER_HOST")); host != "" {
		return host, "DOCKER_HOST"
	}

	if settings.PlatformName == "windows" {
		return "npipe:////./pipe/docker_engine", "Default Windows named pipe"
	}

	candidates := []string{}
	if home := strings.TrimSpace(settings.HomeDir); home != "" {
		if settings.PlatformName == "linux" {
			candidates = append(candidates, filepath.Join(home, ".docker", "desktop", "docker.sock"))
			if runtimeDir := strings.TrimSpace(os.Getenv("XDG_RUNTIME_DIR")); runtimeDir != "" {
				candidates = append(candidates, filepath.Join(runtimeDir, "docker.sock"))
			}
		}
		if settings.PlatformName == "macos" {
			candidates = append(candidates, filepath.Join(home, ".docker", "run", "docker.sock"))
		}
	}
	candidates = append(candidates, "/var/run/docker.sock")

	for _, candidate := range candidates {
		if _, err := os.Stat(candidate); err == nil {
			return "unix://" + candidate, "Local socket"
		}
	}

	return "", "No Docker host detected"
}

func mapContainer(item containerapi.Summary) models.ManagedDockerResource {
	name := item.ID
	if len(item.Names) > 0 {
		name = strings.TrimPrefix(item.Names[0], "/")
	}
	return models.ManagedDockerResource{
		ResourceID: item.ID,
		Kind:       "container",
		Name:       name,
		State:      string(item.State),
		Summary:    firstNonEmpty(item.Status, "CloudSprocket-managed container"),
		Owned:      true,
		Details: []models.DetailField{
			{Label: "Image", Value: item.Image},
			{Label: "Status", Value: firstNonEmpty(item.Status, string(item.State))},
		},
	}
}

func mapNetwork(item networkapi.Summary) models.ManagedDockerResource {
	return models.ManagedDockerResource{
		ResourceID: item.ID,
		Kind:       "network",
		Name:       item.Name,
		State:      item.Scope,
		Summary:    fmt.Sprintf("%s network managed by CloudSprocket.", firstNonEmpty(item.Driver, "docker")),
		Owned:      true,
		Details: []models.DetailField{
			{Label: "Driver", Value: firstNonEmpty(item.Driver, "Unavailable")},
			{Label: "Scope", Value: firstNonEmpty(item.Scope, "Unavailable")},
		},
	}
}

func mapVolume(item volumeapi.Volume) models.ManagedDockerResource {
	return models.ManagedDockerResource{
		ResourceID: item.Name,
		Kind:       "volume",
		Name:       item.Name,
		State:      item.Scope,
		Summary:    fmt.Sprintf("%s volume managed by CloudSprocket.", firstNonEmpty(item.Driver, "docker")),
		Owned:      true,
		Details: []models.DetailField{
			{Label: "Driver", Value: firstNonEmpty(item.Driver, "Unavailable")},
			{Label: "Mountpoint", Value: firstNonEmpty(item.Mountpoint, "Unavailable")},
		},
	}
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return value
		}
	}
	return ""
}

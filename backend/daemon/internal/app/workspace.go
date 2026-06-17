package app

import (
	"path/filepath"

	"cloudsprocket/backend/daemon/internal/discovery"
	"cloudsprocket/backend/daemon/internal/models"
)

func (s *Service) buildWorkspaceSnapshot(
	snapshot discovery.Snapshot,
	session models.SessionSnapshot,
) models.WorkspaceSnapshot {
	dockerRuntime := s.dockerRuntimeSnapshot()
	// Only enumerate managed Docker resources when the engine is reachable. When
	// Docker is stopped the resource probe would otherwise wait out its own
	// timeout to return an empty list, doubling the Docker latency of every
	// workspace fetch and Local Runtime poll.
	dockerResources := []models.ManagedDockerResource{}
	// When the engine is unreachable, skip the per-emulator Docker probes too and
	// fall back to the static planned summaries. Each live probe would otherwise
	// wait out its own timeout, and with both LocalStack and floci-az that adds
	// several seconds to every workspace fetch and Local Runtime poll.
	emulatorSummaries := s.emulatorSummaries()
	if dockerRuntime.Reachable {
		dockerResources = s.dockerResources()
		emulatorSummaries = s.emulatorsList()
	}
	workspace := models.WorkspaceSnapshot{
		AuthMethod:             session.SelectedAuthMethod,
		RuntimeSettings:        s.settingsSnapshot(),
		EnvironmentDiagnostics: s.environmentDiagnostics(snapshot, session),
		DockerDiagnostics:      s.dockerDiagnosticsFromSnapshot(dockerRuntime),
		DockerRuntime:          dockerRuntime,
		DockerResources:        dockerResources,
		EmulatorSummaries:      emulatorSummaries,
		LocalConfigArtifacts:   s.localConfigArtifacts(),
		AzureResourceGroups:    []models.AzureResourceGroup{},
		AzureVirtualMachines:   []models.AzureVirtualMachine{},
		AzureStorageAccounts:   []models.AzureStorageAccount{},
		AzureBlobContainers:    []models.AzureBlobContainer{},
		AzureBlobs:             []models.AzureBlob{},
		S3PrefixFilter:         session.S3PrefixFilter,
		S3Buckets:              []models.AwsS3Bucket{},
		S3Objects:              []models.AwsS3Object{},
		S3ObjectMetadata:       []models.DetailField{},
		EC2Regions:             []string{},
		EC2Instances:           []models.AwsEc2Instance{},
		LambdaRegions:          []string{},
		LambdaFunctions:        []models.AwsLambdaFunction{},
		DynamoDBRegions:        []string{},
		DynamoDBTables:         []models.AwsDynamoDBTable{},
	}

	if provider, ok := findProvider(snapshot.Providers, session.CurrentProviderID); ok {
		workspace.Provider = &provider
	}

	profiles := filterProfiles(snapshot.Profiles, session.CurrentProviderID)
	if profile, ok := findProfile(profiles, session.SelectedProfileID); ok {
		workspace.Profile = &profile
		if session.CurrentProviderID == "aws" {
			workspace.AWSEndpointURL = profileEndpointURL(profile)
			workspace.AWSWriteCapable = profileAllowsAWSWrites(profile)
			workspace.AWSWriteModeEnabled = session.AWSWriteModeEnabled && session.IsLocked
			workspace.AWSWritesEnabled = effectiveAWSWritesEnabled(session, profile)
		}
		if session.CurrentProviderID == "azure" {
			azureCLI := ""
			if provider, ok := findProvider(snapshot.Providers, "azure"); ok {
				azureCLI = provider.CommandPath
			}
			workspace.AzureEndpointURL = profileAzureEndpointURL(profile, s.settings.FlociAZEndpoint)
			workspace.AzureWriteCapable = profileAllowsAzureWrites(profile, azureCLI)
			workspace.AzureWriteModeEnabled = session.AzureWriteModeEnabled && session.IsLocked
			workspace.AzureWritesEnabled = effectiveAzureWritesEnabled(session, profile, azureCLI)
		}
	}

	s.enrichAzureInventory(&workspace, session)
	s.enrichAzureStorageInventory(&workspace, session)
	s.enrichS3Inventory(&workspace, session)
	s.enrichEC2Inventory(&workspace, session)
	s.enrichLambdaInventory(&workspace, session)
	s.enrichDynamoDBInventory(&workspace, session)
	s.enrichSQSInventory(&workspace, session)
	s.enrichSNSInventory(&workspace, session)
	s.enrichRDSInventory(&workspace, session)
	s.enrichLogsInventory(&workspace, session)
	s.enrichIAMInventory(&workspace, session)

	return workspace
}

func (s *Service) environmentDiagnostics(snapshot discovery.Snapshot, session models.SessionSnapshot) []models.DetailField {
	fields := []models.DetailField{
		{Label: "Platform", Value: s.settings.PlatformName},
		{Label: "Config Directory", Value: pathStatus(s.settings.ConfigDir, true)},
		{Label: "Local Config Directory", Value: pathStatus(s.settings.LocalConfigDir, true)},
		{Label: "Emulator State Directory", Value: pathStatus(s.settings.EmulatorStateDir, true)},
		{Label: "Database", Value: pathStatus(s.settings.DatabasePath, false)},
		{Label: "Log Directory", Value: pathStatus(filepath.Dir(s.settings.LogPath), true)},
		{Label: "AWS Config", Value: pathStatus(s.settings.AWSConfigPath, false)},
		{Label: "AWS Credentials", Value: pathStatus(s.settings.AWSCredentialsPath, false), Sensitive: true},
		{Label: "Azure Profile", Value: pathStatus(s.settings.AzureProfilePath(), false)},
		{Label: "GCloud Config", Value: pathStatus(s.settings.GCloudConfigDir(), true)},
	}
	if provider, ok := findProvider(snapshot.Providers, session.CurrentProviderID); ok {
		cliStatus := "Not detected"
		if provider.CommandPath != "" {
			cliStatus = provider.CommandPath
		}
		fields = append(fields, models.DetailField{Label: provider.Label + " CLI", Value: cliStatus})
	}
	if profile, ok := findProfile(filterProfiles(snapshot.Profiles, session.CurrentProviderID), session.SelectedProfileID); ok {
		fields = append(fields,
			models.DetailField{Label: "Selected Profile", Value: profile.ProfileID},
			models.DetailField{Label: "Write Policy", Value: writePolicySummary(profile)},
		)
	}
	return fields
}

func (s *Service) localConfigArtifacts() []models.LocalConfigArtifact {
	artifacts := []models.LocalConfigArtifact{
		newLocalConfigArtifact(
			"aws-local-config",
			"aws",
			"AWS Local Config",
			filepath.Join(s.settings.LocalConfigDir, "aws", "config"),
			"App-managed AWS local profile configuration will be written here.",
		),
		newLocalConfigArtifact(
			"aws-local-credentials",
			"aws",
			"AWS Local Credentials",
			filepath.Join(s.settings.LocalConfigDir, "aws", "credentials"),
			"App-managed AWS local dummy credentials will be written here.",
		),
		newLocalConfigArtifact(
			"azure-local-env",
			"azure",
			"Azure Local Env File",
			filepath.Join(s.settings.LocalConfigDir, "azure", "floci-az.env"),
			"App-managed Azure local connection strings and env values will be written here.",
		),
	}
	return artifacts
}

func (s *Service) emulatorSummaries() []models.EmulatorSummary {
	artifacts := s.localConfigArtifacts()
	awsDetails := []models.DetailField{
		{Label: "Image", Value: s.settings.LocalStackImage},
		{Label: "Managed Config Root", Value: filepath.Join(s.settings.LocalConfigDir, "aws")},
	}
	azureDetails := []models.DetailField{
		{Label: "Image", Value: s.settings.FlociAZImage},
		{Label: "Managed Config Root", Value: filepath.Join(s.settings.LocalConfigDir, "azure")},
	}
	if len(artifacts) > 0 {
		awsDetails = append(awsDetails, models.DetailField{Label: "Managed Artifacts", Value: "Prepared paths only in this slice"})
		azureDetails = append(azureDetails, models.DetailField{Label: "Managed Artifacts", Value: "Prepared paths only in this slice"})
	}

	return []models.EmulatorSummary{
		{
			EmulatorID: "localstack",
			ProviderID: "aws",
			Label:      "LocalStack",
			Kind:       "docker",
			Status:     models.EmulatorStatusNotConfigured,
			Summary:    "Managed AWS local runtime is planned but not configured yet.",
			Details:    awsDetails,
		},
		{
			EmulatorID: "floci-az",
			ProviderID: "azure",
			Label:      "floci-az",
			Kind:       "docker",
			Status:     models.EmulatorStatusNotConfigured,
			Summary:    "Managed Azure local runtime is planned but not configured yet.",
			Details:    azureDetails,
		},
	}
}

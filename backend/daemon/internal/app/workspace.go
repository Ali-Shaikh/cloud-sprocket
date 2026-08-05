// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package app

import (
	"context"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"cloudsprocket/backend/daemon/internal/discovery"
	"cloudsprocket/backend/daemon/internal/models"
)

type workspaceSnapshotOptions struct {
	// lightweightAzure skips expensive Azure drill-down on workspace.get while
	// selection handlers and finishAzureWorkspace load detail on demand.
	lightweightAzure bool
	// azureResourceGroupSelection only refreshes resource groups, VMs, and App
	// Service inventory for the selected resource group.
	azureResourceGroupSelection bool
	// skipAwsInventory avoids reloading AWS service inventories during Azure
	// workspace selection handlers.
	skipAwsInventory bool
	// azureScope limits Azure enrichment to one service during selection
	// handlers (storage, functions, keyvault, cosmos, waf, frontdoor, queues, webapps).
	azureScope string
	// lightweightAWS skips expensive AWS drill-down on workspace.get while
	// selection handlers load detail on demand.
	lightweightAWS bool
	// skipAzureInventory avoids reloading Azure inventories during AWS
	// workspace selection handlers.
	skipAzureInventory bool
	// awsScope limits AWS enrichment to one service during selection handlers.
	awsScope string
	// azureDeferredInventory loads only resource groups and VMs on workspace.get.
	// Other Azure services load on demand via azure.inventory.get per tab scope.
	azureDeferredInventory bool
	// awsDeferredInventory loads only S3 buckets and EC2 regions on workspace.get.
	// Other AWS services load on demand via aws.inventory.get per tab scope.
	awsDeferredInventory bool
}

// buildWorkspaceSnapshot rebuilds a full inventory for the current provider.
// Prefer buildWorkspaceSnapshotOpts with scope and skip flags on single-service
// paths so callers do not accidentally re-enrich every enabled service.
func (s *Service) buildWorkspaceSnapshot(
	ctx context.Context,
	snapshot discovery.Snapshot,
	session models.SessionSnapshot,
) models.WorkspaceSnapshot {
	return s.buildWorkspaceSnapshotOpts(ctx, snapshot, session, workspaceSnapshotOptions{})
}

func (s *Service) buildWorkspaceSnapshotOpts(
	ctx context.Context,
	snapshot discovery.Snapshot,
	session models.SessionSnapshot,
	opts workspaceSnapshotOptions,
) models.WorkspaceSnapshot {
	runtime := s.runtimeStatusForSnapshot(ctx)
	workspace := models.WorkspaceSnapshot{
		AuthMethod:             session.SelectedAuthMethod,
		RuntimeSettings:        s.settingsSnapshot(),
		EnvironmentDiagnostics: s.environmentDiagnostics(snapshot, session),
		DockerDiagnostics:      s.dockerDiagnosticsFromSnapshot(runtime.Docker),
		DockerRuntime:          runtime.Docker,
		DockerResources:        runtime.Resources,
		EmulatorSummaries:      runtime.Emulators,
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
		GcpStorageBuckets:      []models.GcpStorageBucket{},
		GcpStorageObjects:      []models.GcpStorageObject{},
		GcpStoragePrefixFilter: session.GcpStoragePrefixFilter,
	}

	if provider, ok := findProvider(snapshot.Providers, session.CurrentProviderID); ok {
		workspace.Provider = &provider
	}

	profiles := filterProfiles(snapshot.Profiles, session.CurrentProviderID)
	if profile, ok := findProfile(profiles, session.SelectedProfileID); ok {
		workspace.Profile = &profile
		if session.CurrentProviderID == "azure" {
			workspace.AzureCLIExtensions = s.azureCLIExtensionChecks(snapshot, profile)
		}
		if session.CurrentProviderID == "aws" {
			workspace.AWSEndpointURL = profileEndpointURL(profile)
			workspace.AWSWriteCapable = session.IsLocked
			workspace.AWSWriteTargetIsLocal = profileIsLocalAWSEndpoint(profile)
			workspace.AWSWriteModeEnabled = session.AWSWriteModeEnabled && session.IsLocked
			workspace.AWSWritesEnabled = effectiveAWSWritesEnabled(session, profile)
			workspace.ActionCapabilities = buildAWSActionCapabilities(session, profile)
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
			workspace.ActionCapabilities = buildAzureActionCapabilities(session, profile, azureCLI)
		}
	}

	azureOpts := azureEnrichmentOptions{
		lightweight:            opts.lightweightAzure,
		scope:                  opts.azureScope,
		resourceGroupSelection: opts.azureResourceGroupSelection,
	}
	if !opts.skipAzureInventory &&
		workspace.Provider != nil &&
		workspace.Provider.ProviderID == "azure" &&
		s.isProviderEnabled("azure") {
		if opts.azureDeferredInventory {
			if s.anyServiceEnabled("azure", azureEnricherServiceIDs("inventory")) {
				var mu sync.Mutex
				s.enrichAzureInventory(&workspace, session, &mu)
			}
		} else {
			s.enrichAzureWorkspace(&workspace, session, azureOpts)
		}
	}
	if !opts.azureResourceGroupSelection &&
		!opts.skipAwsInventory &&
		workspace.Provider != nil &&
		workspace.Provider.ProviderID == "aws" &&
		s.isProviderEnabled("aws") {
		awsOpts := awsEnrichmentOptions{
			lightweight: opts.lightweightAWS,
			scope:       opts.awsScope,
		}
		if opts.awsDeferredInventory {
			var mu sync.Mutex
			s.enrichAwsInventory(&workspace, session, &mu)
		} else {
			s.enrichAwsWorkspace(&workspace, session, awsOpts)
		}
	}
	if workspace.Provider != nil &&
		workspace.Provider.ProviderID == "gcp" &&
		s.isProviderEnabled("gcp") {
		s.enrichGcpWorkspace(&workspace, session)
	}

	return workspace
}

func (s *Service) azureCLIExtensionChecks(snapshot discovery.Snapshot, profile models.ProfileSummary) []models.AzureCLIExtensionStatus {
	if s.azure == nil || isLocalFlociProfile(profile) {
		return nil
	}
	provider, ok := findProvider(snapshot.Providers, "azure")
	if !ok || strings.TrimSpace(provider.CommandPath) == "" {
		return nil
	}
	profileID := strings.TrimSpace(profile.ProfileID)
	// Empty profile IDs skip the cache entirely so a blank key cannot poison a
	// later real subscription's entry.
	if profileID == "" {
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		return s.azure.CheckCLIExtensions(ctx)
	}

	s.azureCLIExtMu.Lock()
	if s.azureCLIExtProfileID == profileID &&
		s.now().Sub(s.azureCLIExtAt) < azureCLIExtensionCacheTTL {
		statuses := append([]models.AzureCLIExtensionStatus(nil), s.azureCLIExtStatuses...)
		s.azureCLIExtMu.Unlock()
		return statuses
	}
	s.azureCLIExtMu.Unlock()

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	statuses := s.azure.CheckCLIExtensions(ctx)

	// Do not cache list failures: a transient az outage would otherwise show
	// every extension as missing for the full success TTL.
	if azureCLIExtensionListSucceeded(statuses) {
		s.azureCLIExtMu.Lock()
		s.azureCLIExtProfileID = profileID
		s.azureCLIExtStatuses = append([]models.AzureCLIExtensionStatus(nil), statuses...)
		s.azureCLIExtAt = s.now()
		s.azureCLIExtMu.Unlock()
	}
	return statuses
}

func azureCLIExtensionListSucceeded(statuses []models.AzureCLIExtensionStatus) bool {
	// Never cache an empty/nil result: a silent failure mode would otherwise
	// suppress extension-missing warnings for the full success TTL.
	if len(statuses) == 0 {
		return false
	}
	for _, status := range statuses {
		if strings.Contains(status.Summary, "could not query installed extensions") {
			return false
		}
	}
	return true
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



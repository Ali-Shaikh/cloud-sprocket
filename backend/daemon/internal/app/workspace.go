package app

import (
	"context"
	"fmt"
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
		workspace.AWSEndpointURL = profileEndpointURL(profile)
		workspace.AWSWriteCapable = profileAllowsAWSWrites(profile)
		workspace.AWSWriteModeEnabled = session.AWSWriteModeEnabled && session.IsLocked && session.CurrentProviderID == "aws"
		workspace.AWSWritesEnabled = effectiveAWSWritesEnabled(session, profile)
	}

	if workspace.Provider != nil &&
		workspace.Provider.ProviderID == "azure" &&
		workspace.Profile != nil &&
		s.azure != nil {
		workspace.AzureResourceGroups = s.azureResourceGroups(context.Background(), *workspace.Profile)
		workspace.SelectedAzureResourceGroup = s.selectedAzureResourceGroup(session, workspace.AzureResourceGroups)
		workspace.AzureVirtualMachines = s.azureVirtualMachines(
			context.Background(),
			*workspace.Profile,
			workspace.SelectedAzureResourceGroup,
		)
		workspace.SelectedAzureVMID = s.selectedAzureVMID(session, workspace.AzureVirtualMachines)
		if len(workspace.AzureResourceGroups) == 0 {
			workspace.AzureStatusMessage = "No Azure resource groups are currently available for this workspace."
		} else if workspace.SelectedAzureResourceGroup == "" {
			workspace.AzureStatusMessage = "Select an Azure resource group to inspect its virtual machines."
		} else if len(workspace.AzureVirtualMachines) == 0 {
			workspace.AzureStatusMessage = fmt.Sprintf("No Azure virtual machines were returned for %s.", workspace.SelectedAzureResourceGroup)
		} else {
			workspace.AzureStatusMessage = fmt.Sprintf(
				"Loaded %d Azure virtual machines from %s.",
				len(workspace.AzureVirtualMachines),
				workspace.SelectedAzureResourceGroup,
			)
		}
	}

	if workspace.Provider != nil &&
		workspace.Provider.ProviderID == "aws" &&
		workspace.Profile != nil &&
		s.s3 != nil {
		timeoutCtx, cancel := s.withAWSTimeout(context.Background())
		workspace.S3Buckets = s.s3Buckets(timeoutCtx, *workspace.Profile)
		cancel()
		workspace.SelectedS3BucketName = s.selectedS3BucketName(session, workspace.S3Buckets)
		timeoutCtx, cancel = s.withAWSTimeout(context.Background())
		workspace.S3Objects = s.s3Objects(
			timeoutCtx,
			*workspace.Profile,
			workspace.SelectedS3BucketName,
			session.S3PrefixFilter,
		)
		cancel()
		workspace.SelectedS3ObjectKey = s.selectedS3ObjectKey(session, workspace.S3Objects)
		timeoutCtx, cancel = s.withAWSTimeout(context.Background())
		workspace.S3ObjectMetadata = s.s3ObjectMetadata(
			timeoutCtx,
			*workspace.Profile,
			workspace.SelectedS3BucketName,
			workspace.SelectedS3ObjectKey,
		)
		cancel()
		workspace.S3ExportSnippets = s.s3ExportSnippets(
			workspace.SelectedS3BucketName,
			workspace.SelectedS3ObjectKey,
		)
		if workspace.SelectedS3BucketName == "" {
			workspace.S3StatusMessage = "No buckets are currently available for this AWS workspace."
		} else if len(workspace.S3Objects) == 0 {
			if session.S3PrefixFilter != "" {
				workspace.S3StatusMessage = fmt.Sprintf(
					"No objects matched prefix %q in %s.",
					session.S3PrefixFilter,
					workspace.SelectedS3BucketName,
				)
			} else {
				workspace.S3StatusMessage = fmt.Sprintf("No objects were returned for %s.", workspace.SelectedS3BucketName)
			}
		} else {
			workspace.S3StatusMessage = fmt.Sprintf(
				"Loaded %d objects from %s.",
				len(workspace.S3Objects),
				workspace.SelectedS3BucketName,
			)
		}
	}

	if workspace.Provider != nil &&
		workspace.Provider.ProviderID == "aws" &&
		workspace.Profile != nil &&
		s.ec2 != nil {
		timeoutCtx, cancel := s.withAWSTimeout(context.Background())
		workspace.EC2Regions = s.ec2Regions(timeoutCtx, *workspace.Profile)
		cancel()
		workspace.SelectedEC2Region = s.selectedEC2Region(session, workspace.EC2Regions, *workspace.Profile)
		timeoutCtx, cancel = s.withAWSTimeout(context.Background())
		workspace.EC2Instances = s.ec2Instances(timeoutCtx, *workspace.Profile, workspace.SelectedEC2Region)
		cancel()
		workspace.SelectedEC2InstanceID = s.selectedEC2InstanceID(session, workspace.EC2Instances)
		if workspace.SelectedEC2Region == "" {
			workspace.EC2StatusMessage = "No EC2 region is available for this AWS workspace."
		} else if len(workspace.EC2Instances) == 0 {
			workspace.EC2StatusMessage = fmt.Sprintf("No EC2 instances were returned for %s.", workspace.SelectedEC2Region)
		} else {
			workspace.EC2StatusMessage = fmt.Sprintf(
				"Loaded %d EC2 instances from %s.",
				len(workspace.EC2Instances),
				workspace.SelectedEC2Region,
			)
		}
	}

	// Lambda inventory (v0.6 breadth). Uses the same AWS profile/region model as EC2.
	// Protected by withAWSTimeout (added for production parity with Azure + to protect
	// all AWS calls from stalls on real cloud or LocalStack).
	if workspace.Provider != nil &&
		workspace.Provider.ProviderID == "aws" &&
		workspace.Profile != nil &&
		s.lambda != nil {
		timeoutCtx, cancel := s.withAWSTimeout(context.Background())
		workspace.LambdaRegions = s.lambdaRegions(timeoutCtx, *workspace.Profile)
		cancel()
		workspace.SelectedLambdaRegion = s.selectedLambdaRegion(session, workspace.LambdaRegions, *workspace.Profile)
		timeoutCtx, cancel = s.withAWSTimeout(context.Background())
		workspace.LambdaFunctions = s.lambdaFunctions(timeoutCtx, *workspace.Profile, workspace.SelectedLambdaRegion)
		cancel()
		workspace.SelectedLambdaFunctionName = s.selectedLambdaFunctionName(session, workspace.LambdaFunctions)
		if workspace.SelectedLambdaRegion == "" {
			workspace.LambdaStatusMessage = "No region is available for Lambda functions in this AWS workspace."
		} else if len(workspace.LambdaFunctions) == 0 {
			workspace.LambdaStatusMessage = fmt.Sprintf("No Lambda functions were returned for %s.", workspace.SelectedLambdaRegion)
		} else {
			workspace.LambdaStatusMessage = fmt.Sprintf(
				"Loaded %d Lambda functions from %s.",
				len(workspace.LambdaFunctions),
				workspace.SelectedLambdaRegion,
			)
		}

		// Enrich the selected function with full describe data (config + recent CloudWatch logs)
		// so the UI gets the rich detail without extra RPC on every render.
		if workspace.SelectedLambdaFunctionName != "" && workspace.Profile != nil {
			timeoutCtx, cancel := s.withAWSTimeout(context.Background())
			if full, err := s.lambda.DescribeFunction(timeoutCtx, *workspace.Profile, workspace.SelectedLambdaRegion, workspace.SelectedLambdaFunctionName); err == nil {
				for i := range workspace.LambdaFunctions {
					if workspace.LambdaFunctions[i].FunctionName == full.FunctionName {
						workspace.LambdaFunctions[i] = full
						break
					}
				}
			}
			cancel()
		}
	}

	// DynamoDB inventory (v0.6 breadth). Read-only table list, describe, and sample scan.
	if workspace.Provider != nil &&
		workspace.Provider.ProviderID == "aws" &&
		workspace.Profile != nil &&
		s.dynamodb != nil {
		timeoutCtx, cancel := s.withAWSTimeout(context.Background())
		workspace.DynamoDBRegions = s.dynamodbRegions(timeoutCtx, *workspace.Profile)
		cancel()
		workspace.SelectedDynamoDBRegion = s.selectedDynamoDBRegion(session, workspace.DynamoDBRegions, *workspace.Profile)
		timeoutCtx, cancel = s.withAWSTimeout(context.Background())
		workspace.DynamoDBTables = s.dynamodbTables(timeoutCtx, *workspace.Profile, workspace.SelectedDynamoDBRegion)
		cancel()
		workspace.SelectedDynamoDBTableName = s.selectedDynamoDBTableName(session, workspace.DynamoDBTables)
		if workspace.SelectedDynamoDBRegion == "" {
			workspace.DynamoDBStatusMessage = "No region is available for DynamoDB tables in this AWS workspace."
		} else if len(workspace.DynamoDBTables) == 0 {
			workspace.DynamoDBStatusMessage = fmt.Sprintf("No DynamoDB tables were returned for %s.", workspace.SelectedDynamoDBRegion)
		} else {
			workspace.DynamoDBStatusMessage = fmt.Sprintf(
				"Loaded %d DynamoDB tables from %s.",
				len(workspace.DynamoDBTables),
				workspace.SelectedDynamoDBRegion,
			)
		}

		if workspace.SelectedDynamoDBTableName != "" && workspace.Profile != nil {
			timeoutCtx, cancel := s.withAWSTimeout(context.Background())
			if full, err := s.dynamodb.DescribeTable(timeoutCtx, *workspace.Profile, workspace.SelectedDynamoDBRegion, workspace.SelectedDynamoDBTableName); err == nil {
				for i := range workspace.DynamoDBTables {
					if workspace.DynamoDBTables[i].TableName == full.TableName {
						workspace.DynamoDBTables[i] = full
						break
					}
				}
			}
			cancel()
		}
	}

	// SQS inventory (v0.6 breadth). Read-only queue list and attributes; peek is RPC-only.
	if workspace.Provider != nil &&
		workspace.Provider.ProviderID == "aws" &&
		workspace.Profile != nil &&
		s.sqs != nil {
		timeoutCtx, cancel := s.withAWSTimeout(context.Background())
		workspace.SQSRegions = s.sqsRegions(timeoutCtx, *workspace.Profile)
		cancel()
		workspace.SelectedSQSRegion = s.selectedSQSRegion(session, workspace.SQSRegions, *workspace.Profile)
		timeoutCtx, cancel = s.withAWSTimeout(context.Background())
		workspace.SQSQueues = s.sqsQueues(timeoutCtx, *workspace.Profile, workspace.SelectedSQSRegion)
		cancel()
		workspace.SelectedSQSQueueURL = s.selectedSQSQueueURL(session, workspace.SQSQueues)
		if workspace.SelectedSQSRegion == "" {
			workspace.SQSStatusMessage = "No region is available for SQS queues in this AWS workspace."
		} else if len(workspace.SQSQueues) == 0 {
			workspace.SQSStatusMessage = fmt.Sprintf("No SQS queues were returned for %s.", workspace.SelectedSQSRegion)
		} else {
			workspace.SQSStatusMessage = fmt.Sprintf(
				"Loaded %d SQS queues from %s.",
				len(workspace.SQSQueues),
				workspace.SelectedSQSRegion,
			)
		}

		if workspace.SelectedSQSQueueURL != "" && workspace.Profile != nil {
			timeoutCtx, cancel := s.withAWSTimeout(context.Background())
			if full, err := s.sqs.DescribeQueue(timeoutCtx, *workspace.Profile, workspace.SelectedSQSRegion, workspace.SelectedSQSQueueURL); err == nil {
				for i := range workspace.SQSQueues {
					if workspace.SQSQueues[i].QueueURL == full.QueueURL {
						workspace.SQSQueues[i] = full
						break
					}
				}
			}
			cancel()
		}
	}

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

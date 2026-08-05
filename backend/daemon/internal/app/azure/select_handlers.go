// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package azure

import (
	"context"
	"encoding/json"
	"strings"

	"cloudsprocket/backend/daemon/internal/app/sessionport"
	"cloudsprocket/backend/daemon/internal/models"
)

// HandleSelectResourceGroup implements azure.selectResourceGroup.
func (s *Service) HandleSelectResourceGroup(ctx context.Context, params json.RawMessage, notifier sessionport.Notifier) (any, error) {
	var request struct {
		ResourceGroup string `json:"resourceGroup"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	snapshot, session, err := s.withLockedAzureWorkspace(ctx, "open an Azure workspace before selecting a resource group", func(session *models.SessionSnapshot) error {
		session.SelectedAzureResourceGroup = strings.TrimSpace(request.ResourceGroup)
		session.SelectedAzureVMID = ""
		return nil
	})
	if err != nil {
		return nil, err
	}
	return s.finishAzureSelection(ctx, snapshot, session, notifier, sessionport.SnapshotOptions{
		AzureResourceGroupSelection: true,
	}, "", "")
}

// HandleSelectVirtualMachine implements azure.selectVirtualMachine.
func (s *Service) HandleSelectVirtualMachine(ctx context.Context, params json.RawMessage, notifier sessionport.Notifier) (any, error) {
	var request struct {
		VMID string `json:"vmId"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	snapshot, session, err := s.withLockedAzureWorkspace(ctx, "open an Azure workspace before selecting a virtual machine", func(session *models.SessionSnapshot) error {
		session.SelectedAzureVMID = strings.TrimSpace(request.VMID)
		return nil
	})
	if err != nil {
		return nil, err
	}
	return s.finishAzureSelection(ctx, snapshot, session, notifier, sessionport.SnapshotOptions{
		AzureResourceGroupSelection: true,
	}, "", "")
}

// HandleWebAppsSelect implements azure.webApps.select.
func (s *Service) HandleWebAppsSelect(ctx context.Context, params json.RawMessage, notifier sessionport.Notifier) (any, error) {
	var request struct {
		AppName string `json:"appName"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	snapshot, session, err := s.withLockedAzureWorkspace(ctx, "open an Azure workspace before selecting a web app", func(session *models.SessionSnapshot) error {
		session.SelectedAzureWebAppName = request.AppName
		session.SelectedAzureWebAppSlot = ""
		return nil
	})
	if err != nil {
		return nil, err
	}
	return s.finishAzureSelection(ctx, snapshot, session, notifier, sessionport.SnapshotOptions{
		AzureScope: "webapps",
	}, "", "")
}

// HandleWebAppsSelectSlot implements azure.webApps.selectSlot.
func (s *Service) HandleWebAppsSelectSlot(ctx context.Context, params json.RawMessage, notifier sessionport.Notifier) (any, error) {
	var request struct {
		Slot string `json:"slot"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	snapshot, session, err := s.withLockedAzureWorkspace(ctx, "open an Azure workspace before selecting a deployment slot", func(session *models.SessionSnapshot) error {
		session.SelectedAzureWebAppSlot = strings.TrimSpace(request.Slot)
		return nil
	})
	if err != nil {
		return nil, err
	}
	return s.finishAzureSelection(ctx, snapshot, session, notifier, sessionport.SnapshotOptions{
		AzureScope: "webapps",
	}, "", "")
}

// HandleStorageSelectAccount implements azure.storage.selectAccount.
func (s *Service) HandleStorageSelectAccount(ctx context.Context, params json.RawMessage, notifier sessionport.Notifier) (any, error) {
	var request struct {
		AccountName string `json:"accountName"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	snapshot, session, err := s.withLockedAzureWorkspace(ctx, "open an Azure workspace before selecting a storage account", func(session *models.SessionSnapshot) error {
		session.SelectedAzureStorageAccount = request.AccountName
		session.SelectedAzureBlobContainer = ""
		session.SelectedAzureBlobName = ""
		return nil
	})
	if err != nil {
		return nil, err
	}
	return s.finishAzureSelection(ctx, snapshot, session, notifier, sessionport.SnapshotOptions{
		AzureScope: "storage",
	}, "", "")
}

// HandleStorageSelectContainer implements azure.storage.selectContainer.
func (s *Service) HandleStorageSelectContainer(ctx context.Context, params json.RawMessage, notifier sessionport.Notifier) (any, error) {
	var request struct {
		ContainerName string `json:"containerName"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	snapshot, session, err := s.withLockedAzureWorkspace(ctx, "open an Azure workspace before selecting a blob container", func(session *models.SessionSnapshot) error {
		session.SelectedAzureBlobContainer = request.ContainerName
		session.SelectedAzureBlobName = ""
		return nil
	})
	if err != nil {
		return nil, err
	}
	return s.finishAzureSelection(ctx, snapshot, session, notifier, sessionport.SnapshotOptions{
		AzureScope: "storage",
	}, "", "")
}

// HandleStorageSelectBlob implements azure.storage.selectBlob.
func (s *Service) HandleStorageSelectBlob(ctx context.Context, params json.RawMessage, notifier sessionport.Notifier) (any, error) {
	var request struct {
		BlobName string `json:"blobName"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	snapshot, session, err := s.withLockedAzureWorkspace(ctx, "open an Azure workspace before selecting a blob", func(session *models.SessionSnapshot) error {
		session.SelectedAzureBlobName = request.BlobName
		return nil
	})
	if err != nil {
		return nil, err
	}
	return s.finishAzureSelection(ctx, snapshot, session, notifier, sessionport.SnapshotOptions{
		AzureScope: "storage",
	}, "", "")
}

// HandleStorageSetPrefixFilter implements azure.storage.setPrefixFilter.
func (s *Service) HandleStorageSetPrefixFilter(ctx context.Context, params json.RawMessage, notifier sessionport.Notifier) (any, error) {
	var request struct {
		Prefix string `json:"prefix"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	snapshot, session, err := s.withLockedAzureWorkspace(ctx, "open an Azure workspace before setting a blob prefix filter", func(session *models.SessionSnapshot) error {
		session.AzureBlobPrefixFilter = request.Prefix
		session.SelectedAzureBlobName = ""
		return nil
	})
	if err != nil {
		return nil, err
	}
	return s.finishAzureSelection(ctx, snapshot, session, notifier, sessionport.SnapshotOptions{
		AzureScope: "storage",
	}, "", "")
}

// HandleLogAnalyticsSelectWorkspace implements azure.logAnalytics.selectWorkspace.
// Returns AzureLogAnalyticsSelectionResult (not a full workspace rebuild).
func (s *Service) HandleLogAnalyticsSelectWorkspace(ctx context.Context, params json.RawMessage, _ sessionport.Notifier) (any, error) {
	var request struct {
		Workspace string `json:"workspace"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	_, session, err := s.withLockedAzureWorkspace(ctx, "open an Azure workspace before selecting a Log Analytics workspace", func(session *models.SessionSnapshot) error {
		session.SelectedAzureLogWorkspace = strings.TrimSpace(request.Workspace)
		return nil
	})
	if err != nil {
		return nil, err
	}
	return models.AzureLogAnalyticsSelectionResult{Workspace: session.SelectedAzureLogWorkspace}, nil
}

// HandleWafSelectPolicy implements azure.waf.selectPolicy.
func (s *Service) HandleWafSelectPolicy(ctx context.Context, params json.RawMessage, notifier sessionport.Notifier) (any, error) {
	var request struct {
		PolicyName string `json:"policyName"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	snapshot, session, err := s.withLockedAzureWorkspace(ctx, "open an Azure workspace before selecting a WAF policy", func(session *models.SessionSnapshot) error {
		session.SelectedAzureWafPolicy = strings.TrimSpace(request.PolicyName)
		return nil
	})
	if err != nil {
		return nil, err
	}
	return s.finishAzureSelection(ctx, snapshot, session, notifier, sessionport.SnapshotOptions{
		AzureScope: "waf",
	}, "", "")
}

// HandleFrontDoorSelectProfile implements azure.frontDoor.selectProfile.
func (s *Service) HandleFrontDoorSelectProfile(ctx context.Context, params json.RawMessage, notifier sessionport.Notifier) (any, error) {
	var request struct {
		Profile string `json:"profile"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	snapshot, session, err := s.withLockedAzureWorkspace(ctx, "open an Azure workspace before selecting a Front Door profile", func(session *models.SessionSnapshot) error {
		session.SelectedAzureFrontDoorProfile = request.Profile
		session.SelectedAzureFrontDoorEndpoint = ""
		session.SelectedAzureFrontDoorOriginGroup = ""
		return nil
	})
	if err != nil {
		return nil, err
	}
	return s.finishAzureSelection(ctx, snapshot, session, notifier, sessionport.SnapshotOptions{
		AzureScope: "frontdoor",
	}, "", "")
}

// HandleFrontDoorSelectEndpoint implements azure.frontDoor.selectEndpoint.
func (s *Service) HandleFrontDoorSelectEndpoint(ctx context.Context, params json.RawMessage, notifier sessionport.Notifier) (any, error) {
	var request struct {
		Endpoint string `json:"endpoint"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	snapshot, session, err := s.withLockedAzureWorkspace(ctx, "open an Azure workspace before selecting a Front Door endpoint", func(session *models.SessionSnapshot) error {
		session.SelectedAzureFrontDoorEndpoint = request.Endpoint
		return nil
	})
	if err != nil {
		return nil, err
	}
	return s.finishAzureSelection(ctx, snapshot, session, notifier, sessionport.SnapshotOptions{
		AzureScope: "frontdoor",
	}, "", "")
}

// HandleFrontDoorSelectOriginGroup implements azure.frontDoor.selectOriginGroup.
func (s *Service) HandleFrontDoorSelectOriginGroup(ctx context.Context, params json.RawMessage, notifier sessionport.Notifier) (any, error) {
	var request struct {
		OriginGroup string `json:"originGroup"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	snapshot, session, err := s.withLockedAzureWorkspace(ctx, "open an Azure workspace before selecting a Front Door origin group", func(session *models.SessionSnapshot) error {
		session.SelectedAzureFrontDoorOriginGroup = request.OriginGroup
		return nil
	})
	if err != nil {
		return nil, err
	}
	return s.finishAzureSelection(ctx, snapshot, session, notifier, sessionport.SnapshotOptions{
		AzureScope: "frontdoor",
	}, "", "")
}

// HandleFunctionsSelectApp implements azure.functions.selectApp.
func (s *Service) HandleFunctionsSelectApp(ctx context.Context, params json.RawMessage, notifier sessionport.Notifier) (any, error) {
	var request struct {
		AppName string `json:"appName"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	snapshot, session, err := s.withLockedAzureWorkspace(ctx, "open an Azure workspace before selecting a Function App", func(session *models.SessionSnapshot) error {
		session.SelectedAzureFunctionApp = strings.TrimSpace(request.AppName)
		session.SelectedAzureFunction = ""
		return nil
	})
	if err != nil {
		return nil, err
	}
	return s.finishAzureSelection(ctx, snapshot, session, notifier, sessionport.SnapshotOptions{
		AzureScope: "functions",
	}, "", "")
}

// HandleFunctionsSelectFunction implements azure.functions.selectFunction.
func (s *Service) HandleFunctionsSelectFunction(ctx context.Context, params json.RawMessage, notifier sessionport.Notifier) (any, error) {
	var request struct {
		FunctionName string `json:"functionName"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	snapshot, session, err := s.withLockedAzureWorkspace(ctx, "open an Azure workspace before selecting a function", func(session *models.SessionSnapshot) error {
		session.SelectedAzureFunction = strings.TrimSpace(request.FunctionName)
		return nil
	})
	if err != nil {
		return nil, err
	}
	return s.finishAzureSelection(ctx, snapshot, session, notifier, sessionport.SnapshotOptions{
		AzureScope: "functions",
	}, "", "")
}

// HandleKeyVaultSelectVault implements azure.keyVault.selectVault.
func (s *Service) HandleKeyVaultSelectVault(ctx context.Context, params json.RawMessage, notifier sessionport.Notifier) (any, error) {
	var request struct {
		VaultName string `json:"vaultName"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	snapshot, session, err := s.withLockedAzureWorkspace(ctx, "open an Azure workspace before selecting a key vault", func(session *models.SessionSnapshot) error {
		session.SelectedAzureKeyVault = strings.TrimSpace(request.VaultName)
		session.SelectedAzureSecret = ""
		return nil
	})
	if err != nil {
		return nil, err
	}
	return s.finishAzureSelection(ctx, snapshot, session, notifier, sessionport.SnapshotOptions{
		AzureScope: "keyvault",
	}, "", "")
}

// HandleKeyVaultSelectSecret implements azure.keyVault.selectSecret.
func (s *Service) HandleKeyVaultSelectSecret(ctx context.Context, params json.RawMessage, notifier sessionport.Notifier) (any, error) {
	var request struct {
		SecretName string `json:"secretName"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	snapshot, session, err := s.withLockedAzureWorkspace(ctx, "open an Azure workspace before selecting a secret", func(session *models.SessionSnapshot) error {
		session.SelectedAzureSecret = strings.TrimSpace(request.SecretName)
		return nil
	})
	if err != nil {
		return nil, err
	}
	return s.finishAzureSelection(ctx, snapshot, session, notifier, sessionport.SnapshotOptions{
		AzureScope: "keyvault",
	}, "", "")
}

// HandleCosmosSelectAccount implements azure.cosmos.selectAccount.
func (s *Service) HandleCosmosSelectAccount(ctx context.Context, params json.RawMessage, notifier sessionport.Notifier) (any, error) {
	var request struct {
		Account string `json:"account"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	snapshot, session, err := s.withLockedAzureWorkspace(ctx, "open an Azure workspace before selecting a Cosmos account", func(session *models.SessionSnapshot) error {
		session.SelectedAzureCosmosAccount = request.Account
		session.SelectedAzureCosmosDatabase = ""
		session.SelectedAzureCosmosContainer = ""
		return nil
	})
	if err != nil {
		return nil, err
	}
	return s.finishAzureSelection(ctx, snapshot, session, notifier, sessionport.SnapshotOptions{
		AzureScope: "cosmos",
	}, "", "")
}

// HandleCosmosSelectDatabase implements azure.cosmos.selectDatabase.
func (s *Service) HandleCosmosSelectDatabase(ctx context.Context, params json.RawMessage, notifier sessionport.Notifier) (any, error) {
	var request struct {
		Database string `json:"database"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	snapshot, session, err := s.withLockedAzureWorkspace(ctx, "open an Azure workspace before selecting a Cosmos database", func(session *models.SessionSnapshot) error {
		session.SelectedAzureCosmosDatabase = request.Database
		session.SelectedAzureCosmosContainer = ""
		return nil
	})
	if err != nil {
		return nil, err
	}
	return s.finishAzureSelection(ctx, snapshot, session, notifier, sessionport.SnapshotOptions{
		AzureScope: "cosmos",
	}, "", "")
}

// HandleCosmosSelectContainer implements azure.cosmos.selectContainer.
func (s *Service) HandleCosmosSelectContainer(ctx context.Context, params json.RawMessage, notifier sessionport.Notifier) (any, error) {
	var request struct {
		Container string `json:"container"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	snapshot, session, err := s.withLockedAzureWorkspace(ctx, "open an Azure workspace before selecting a Cosmos container", func(session *models.SessionSnapshot) error {
		session.SelectedAzureCosmosContainer = request.Container
		return nil
	})
	if err != nil {
		return nil, err
	}
	return s.finishAzureSelection(ctx, snapshot, session, notifier, sessionport.SnapshotOptions{
		AzureScope: "cosmos",
	}, "", "")
}

// HandlePostgresSelectServer implements azure.postgres.selectServer.
func (s *Service) HandlePostgresSelectServer(ctx context.Context, params json.RawMessage, notifier sessionport.Notifier) (any, error) {
	var request struct {
		Server string `json:"server"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	snapshot, session, err := s.withLockedAzureWorkspace(ctx, "open an Azure workspace before selecting a PostgreSQL server", func(session *models.SessionSnapshot) error {
		session.SelectedAzurePostgresServer = request.Server
		return nil
	})
	if err != nil {
		return nil, err
	}
	return s.finishAzureSelection(ctx, snapshot, session, notifier, sessionport.SnapshotOptions{
		AzureScope: "postgres",
	}, "", "")
}

// HandleQueuesSelectQueue implements azure.queues.selectQueue.
func (s *Service) HandleQueuesSelectQueue(ctx context.Context, params json.RawMessage, notifier sessionport.Notifier) (any, error) {
	var request struct {
		Queue string `json:"queue"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	snapshot, session, err := s.withLockedAzureWorkspace(ctx, "open an Azure workspace before selecting a queue", func(session *models.SessionSnapshot) error {
		session.SelectedAzureQueue = request.Queue
		return nil
	})
	if err != nil {
		return nil, err
	}
	return s.finishAzureSelection(ctx, snapshot, session, notifier, sessionport.SnapshotOptions{
		AzureScope: "queues",
	}, "", "")
}

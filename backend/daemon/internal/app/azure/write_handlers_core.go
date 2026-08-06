// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package azure

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"cloudsprocket/backend/daemon/internal/app/sessionport"
	"cloudsprocket/backend/daemon/internal/models"
)

func resourceGroupWriteOpts() sessionport.SnapshotOptions {
	return sessionport.SnapshotOptions{AzureResourceGroupSelection: true}
}

// HandleResourceGroupsCreate implements azure.resourceGroups.create.
func (s *Service) HandleResourceGroupsCreate(ctx context.Context, params json.RawMessage, notifier sessionport.Notifier) (any, error) {
	if s == nil || s.resourceGroups == nil {
		return nil, errors.New("azure write service is not available")
	}
	var request struct {
		Name     string `json:"name"`
		Location string `json:"location"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	name := strings.TrimSpace(request.Name)
	if name == "" {
		return nil, errors.New("resource group name is required")
	}
	snapshot, err := s.discovery.Discover()
	if err != nil {
		return nil, err
	}
	_, profile, err := s.AuthorizeWrite(
		ctx, snapshot,
		"open a locked Azure workspace before creating a resource group",
		"resource group create requires write mode to be enabled for this Azure workspace",
	)
	if err != nil {
		return nil, err
	}

	actionCtx, cancel := s.WithActionTimeout(ctx)
	created, err := s.resourceGroups.CreateResourceGroup(actionCtx, profile, name, request.Location)
	cancel()
	if err != nil {
		return nil, err
	}
	if s.invalidator != nil {
		s.invalidator.InvalidateResourceCache(ctx, "azure.resource-groups", profile.ProfileID)
	}

	return s.FinishWriteAction(
		ctx, snapshot, notifier, resourceGroupWriteOpts(),
		fmt.Sprintf("Created Azure resource group %s.", created.Name),
		func(session *models.SessionSnapshot) {
			session.SelectedAzureResourceGroup = created.Name
			session.SelectedAzureVMID = ""
		},
	)
}

// HandleResourceGroupsDelete implements azure.resourceGroups.delete.
func (s *Service) HandleResourceGroupsDelete(ctx context.Context, params json.RawMessage, notifier sessionport.Notifier) (any, error) {
	if s == nil || s.resourceGroups == nil {
		return nil, errors.New("azure write service is not available")
	}
	var request struct {
		Name string `json:"name"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	name := strings.TrimSpace(request.Name)
	if name == "" {
		return nil, errors.New("resource group name is required")
	}
	snapshot, err := s.discovery.Discover()
	if err != nil {
		return nil, err
	}
	_, profile, err := s.AuthorizeWrite(
		ctx, snapshot,
		"open a locked Azure workspace before deleting a resource group",
		"resource group delete requires write mode to be enabled for this Azure workspace",
	)
	if err != nil {
		return nil, err
	}

	actionCtx, cancel := s.WithActionTimeout(ctx)
	err = s.resourceGroups.DeleteResourceGroup(actionCtx, profile, name)
	cancel()
	if err != nil {
		return nil, err
	}
	if s.invalidator != nil {
		s.invalidator.InvalidateResourceCache(ctx, "azure.resource-groups", profile.ProfileID)
	}

	return s.FinishWriteAction(
		ctx, snapshot, notifier, resourceGroupWriteOpts(),
		fmt.Sprintf("Deleted Azure resource group %s.", name),
		func(session *models.SessionSnapshot) {
			if session.SelectedAzureResourceGroup == name {
				session.SelectedAzureResourceGroup = ""
				session.SelectedAzureVMID = ""
			}
		},
	)
}

// HandleVirtualMachinesInvokeAction implements azure.virtualMachines.invokeAction.
func (s *Service) HandleVirtualMachinesInvokeAction(ctx context.Context, params json.RawMessage, notifier sessionport.Notifier) (any, error) {
	if s == nil || s.virtualMachines == nil {
		return nil, errors.New("azure write service is not available")
	}
	var request struct {
		Action string `json:"action"`
		VMID   string `json:"vmId"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	action := strings.TrimSpace(request.Action)
	if action == "" {
		return nil, errors.New("virtual machine action is required")
	}
	snapshot, err := s.discovery.Discover()
	if err != nil {
		return nil, err
	}
	session, profile, err := s.AuthorizeWrite(
		ctx, snapshot,
		"open an Azure workspace before invoking virtual machine actions",
		"virtual machine actions require write mode to be enabled for this Azure workspace",
	)
	if err != nil {
		return nil, err
	}
	_, resourceGroup, vm, err := ActiveVirtualMachineSelection(ctx, s.resourceGroups, s.virtualMachines, snapshot, session, request.VMID)
	if err != nil {
		return nil, err
	}

	actionCtx, cancel := s.WithActionTimeout(ctx)
	err = s.virtualMachines.InvokeVirtualMachineAction(actionCtx, profile, resourceGroup, vm.Name, action)
	cancel()
	if err != nil {
		return nil, err
	}

	return s.FinishWriteAction(
		ctx, snapshot, notifier, resourceGroupWriteOpts(),
		fmt.Sprintf("Invoked %s on Azure virtual machine %s.", action, vm.Name),
		func(session *models.SessionSnapshot) {
			session.SelectedAzureResourceGroup = resourceGroup
			session.SelectedAzureVMID = vm.VMID
		},
	)
}

// HandleFrontDoorRefresh implements azure.frontDoor.refresh.
func (s *Service) HandleFrontDoorRefresh(ctx context.Context, _ json.RawMessage, notifier sessionport.Notifier) (any, error) {
	snapshot, session, err := s.withLockedAzureWorkspace(ctx, "open an Azure workspace before refreshing Front Door topology", nil)
	if err != nil {
		return nil, err
	}
	return s.finishAzureSelection(ctx, snapshot, session, notifier, sessionport.SnapshotOptions{
		AzureScope: "frontdoor",
	}, "", "")
}

// HandleFrontDoorPurgeCache implements azure.frontDoor.purgeCache.
func (s *Service) HandleFrontDoorPurgeCache(ctx context.Context, params json.RawMessage, notifier sessionport.Notifier) (any, error) {
	if s == nil || s.frontDoor == nil {
		return nil, errors.New("azure write service is not available")
	}
	var request struct {
		ProfileName  string   `json:"profileName"`
		EndpointName string   `json:"endpointName"`
		ContentPaths []string `json:"contentPaths"`
		Domains      []string `json:"domains"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	endpointName := strings.TrimSpace(request.EndpointName)
	if endpointName == "" {
		return nil, errors.New("an endpoint name is required")
	}
	contentPaths := make([]string, 0, len(request.ContentPaths))
	for _, path := range request.ContentPaths {
		trimmed := strings.TrimSpace(path)
		if trimmed != "" {
			contentPaths = append(contentPaths, trimmed)
		}
	}
	if len(contentPaths) == 0 {
		contentPaths = []string{"/*"}
	}
	domains := make([]string, 0, len(request.Domains))
	for _, domain := range request.Domains {
		trimmed := strings.TrimSpace(domain)
		if trimmed != "" {
			domains = append(domains, trimmed)
		}
	}

	snapshot, err := s.discovery.Discover()
	if err != nil {
		return nil, err
	}
	session, _, err := s.AuthorizeWrite(
		ctx, snapshot,
		"open an Azure workspace before invoking Front Door actions",
		"Front Door cache purge requires write mode to be enabled for this Azure workspace",
	)
	if err != nil {
		return nil, err
	}
	profile, resourceGroup, profileName, err := ActiveFrontDoorSelection(ctx, s.frontDoor, snapshot, session, request.ProfileName)
	if err != nil {
		return nil, err
	}

	actionCtx, cancel := s.WithActionTimeout(ctx)
	err = s.frontDoor.PurgeFrontDoorEndpointCache(
		actionCtx,
		profile,
		resourceGroup,
		profileName,
		endpointName,
		contentPaths,
		domains,
	)
	cancel()
	if err != nil {
		return nil, err
	}

	return s.FinishWriteAction(
		ctx, snapshot, notifier, sessionport.SnapshotOptions{AzureScope: "frontdoor"},
		fmt.Sprintf("Purged Front Door cache for endpoint %s.", endpointName),
		nil,
	)
}

// HandleCosmosDeleteItem implements azure.cosmos.deleteItem.
func (s *Service) HandleCosmosDeleteItem(ctx context.Context, params json.RawMessage, notifier sessionport.Notifier) (any, error) {
	if s == nil || s.cosmos == nil {
		return nil, errors.New("azure write service is not available")
	}
	var request struct {
		Account       string `json:"account"`
		ResourceGroup string `json:"resourceGroup"`
		Database      string `json:"database"`
		Container     string `json:"container"`
		ItemID        string `json:"itemId"`
		PartitionKey  string `json:"partitionKey"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	itemID := strings.TrimSpace(request.ItemID)
	if itemID == "" {
		return nil, errors.New("item id is required")
	}

	snapshot, err := s.discovery.Discover()
	if err != nil {
		return nil, err
	}
	session, profile, err := s.AuthorizeWrite(
		ctx, snapshot,
		"open a locked Azure workspace before deleting a Cosmos item",
		"Cosmos delete requires write mode to be enabled for this Azure workspace",
	)
	if err != nil {
		return nil, err
	}

	account := strings.TrimSpace(request.Account)
	if account == "" {
		account = strings.TrimSpace(session.SelectedAzureCosmosAccount)
	}
	database := strings.TrimSpace(request.Database)
	if database == "" {
		database = strings.TrimSpace(session.SelectedAzureCosmosDatabase)
	}
	container := strings.TrimSpace(request.Container)
	if container == "" {
		container = strings.TrimSpace(session.SelectedAzureCosmosContainer)
	}
	if account == "" || database == "" || container == "" {
		return nil, errors.New("select a Cosmos account, database, and container before deleting an item")
	}
	// Resource group is required for cloud accounts; local floci accepts empty.
	resourceGroup := strings.TrimSpace(request.ResourceGroup)

	actionCtx, cancel := s.WithActionTimeout(ctx)
	result, actionErr := s.cosmos.DeleteCosmosItem(
		actionCtx,
		profile,
		account,
		resourceGroup,
		database,
		container,
		itemID,
		strings.TrimSpace(request.PartitionKey),
	)
	cancel()
	if actionErr != nil {
		return nil, actionErr
	}

	return s.FinishWriteAction(
		ctx, snapshot, notifier, sessionport.SnapshotOptions{AzureScope: "cosmos"},
		result.Summary,
		func(session *models.SessionSnapshot) {
			session.SelectedAzureCosmosAccount = account
			session.SelectedAzureCosmosDatabase = database
			session.SelectedAzureCosmosContainer = container
		},
	)
}

// HandleQueuesPurge implements azure.queues.purge.
func (s *Service) HandleQueuesPurge(ctx context.Context, params json.RawMessage, notifier sessionport.Notifier) (any, error) {
	if s == nil || s.queues == nil {
		return nil, errors.New("azure write service is not available")
	}
	var request struct {
		Account string `json:"account"`
		Queue   string `json:"queue"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	accountName := strings.TrimSpace(request.Account)
	queueName := strings.TrimSpace(request.Queue)

	snapshot, err := s.discovery.Discover()
	if err != nil {
		return nil, err
	}
	session, profile, err := s.AuthorizeWrite(
		ctx, snapshot,
		"open a locked Azure workspace before purging a queue",
		"queue purge requires write mode to be enabled for this Azure workspace",
	)
	if err != nil {
		return nil, err
	}
	if accountName == "" {
		accountName = strings.TrimSpace(session.SelectedAzureStorageAccount)
	}
	if queueName == "" {
		queueName = strings.TrimSpace(session.SelectedAzureQueue)
	}
	if accountName == "" {
		return nil, errors.New("select a storage account before purging a queue")
	}
	if queueName == "" {
		return nil, errors.New("select a queue before purging messages")
	}

	actionCtx, cancel := s.WithActionTimeout(ctx)
	result, actionErr := s.queues.PurgeQueueMessages(actionCtx, profile, accountName, queueName)
	cancel()
	if actionErr != nil {
		return nil, actionErr
	}
	if s.invalidator != nil {
		s.invalidator.InvalidateResourceCache(ctx, "azure.storage-queues", profile.ProfileID+"|"+accountName)
	}

	return s.FinishWriteAction(
		ctx, snapshot, notifier, sessionport.SnapshotOptions{AzureScope: "queues"},
		result.Summary,
		func(session *models.SessionSnapshot) {
			session.SelectedAzureStorageAccount = accountName
			session.SelectedAzureQueue = queueName
		},
	)
}

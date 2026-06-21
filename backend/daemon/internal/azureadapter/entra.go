// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package azureadapter

import (
	"context"
	"encoding/json"
	"fmt"

	"cloudsprocket/backend/daemon/internal/models"
)

// errEntraLocalUnsupported explains why the directory is empty on floci-az.
var errEntraLocalUnsupported = fmt.Errorf(
	"floci-az emulates the Entra token/OIDC plane only, not the directory; use a cloud Azure profile")

// ListEntraUsers lists directory users. Cloud only (via the az CLI / Graph);
// floci-az does not emulate the Microsoft Graph directory.
func (i *Inventory) ListEntraUsers(
	ctx context.Context,
	profile models.ProfileSummary,
) ([]models.AzureEntraUser, error) {
	if isLocalFlociProfile(profile) {
		return nil, errEntraLocalUnsupported
	}
	payload, err := i.run(ctx,
		"ad", "user", "list",
		"--query", "[].{displayName:displayName,userPrincipalName:userPrincipalName,id:id}",
		"--output", "json",
		"--only-show-errors",
	)
	if err != nil {
		return nil, err
	}
	var users []models.AzureEntraUser
	if err := json.Unmarshal(payload, &users); err != nil {
		return nil, fmt.Errorf("decode entra users: %w", err)
	}
	return users, nil
}

// ListEntraGroups lists directory groups (cloud only).
func (i *Inventory) ListEntraGroups(
	ctx context.Context,
	profile models.ProfileSummary,
) ([]models.AzureEntraGroup, error) {
	if isLocalFlociProfile(profile) {
		return nil, errEntraLocalUnsupported
	}
	payload, err := i.run(ctx,
		"ad", "group", "list",
		"--query", "[].{displayName:displayName,id:id}",
		"--output", "json",
		"--only-show-errors",
	)
	if err != nil {
		return nil, err
	}
	var groups []models.AzureEntraGroup
	if err := json.Unmarshal(payload, &groups); err != nil {
		return nil, fmt.Errorf("decode entra groups: %w", err)
	}
	return groups, nil
}

// ListEntraAppRegistrations lists app registrations (cloud only).
func (i *Inventory) ListEntraAppRegistrations(
	ctx context.Context,
	profile models.ProfileSummary,
) ([]models.AzureEntraApp, error) {
	if isLocalFlociProfile(profile) {
		return nil, errEntraLocalUnsupported
	}
	payload, err := i.run(ctx,
		"ad", "app", "list",
		"--query", "[].{displayName:displayName,appId:appId}",
		"--output", "json",
		"--only-show-errors",
	)
	if err != nil {
		return nil, err
	}
	var apps []models.AzureEntraApp
	if err := json.Unmarshal(payload, &apps); err != nil {
		return nil, fmt.Errorf("decode entra app registrations: %w", err)
	}
	return apps, nil
}

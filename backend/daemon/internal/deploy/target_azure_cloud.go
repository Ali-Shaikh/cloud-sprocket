// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package deploy

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"strings"

	"cloudsprocket/backend/daemon/internal/config"
)

type azureCloudTarget struct{}

func (t *azureCloudTarget) ID() string { return "azure-cloud" }

func (t *azureCloudTarget) Label(deployment *Deployment) string {
	if profile := strings.TrimSpace(deployment.ProfileID); profile != "" {
		return "Azure subscription " + profile
	}
	return "Azure"
}

func (t *azureCloudTarget) Env(deployment *Deployment, settings config.Settings) []string {
	env := []string{
		"ARM_SUBSCRIPTION_ID=" + deployment.ProfileID,
	}
	if dir := strings.TrimSpace(settings.AzureDir); dir != "" {
		env = append(env, "AZURE_CONFIG_DIR="+dir)
	}
	return env
}

func (t *azureCloudTarget) Preflight(_ context.Context, deployment *Deployment, settings config.Settings, _ TargetOptions) error {
	return checkAzureSubscription(settings, deployment.ProfileID)
}

func (t *azureCloudTarget) WriteOverrides(_ string, _ *Deployment, _ TargetOptions) error {
	return nil
}

func checkAzureSubscription(settings config.Settings, subscriptionID string) error {
	subscriptionID = strings.TrimSpace(subscriptionID)
	if subscriptionID == "" {
		return fmt.Errorf("no Azure subscription selected for a cloud deployment")
	}
	path := settings.AzureProfilePath()
	data, err := os.ReadFile(path)
	if err != nil {
		return fmt.Errorf(
			"Azure profile cache is not available at %s. Sign in with the Azure CLI (`az login`), then try again",
			path,
		)
	}
	var profile struct {
		Subscriptions []struct {
			ID string `json:"id"`
		} `json:"subscriptions"`
	}
	if err := json.Unmarshal(data, &profile); err != nil {
		return fmt.Errorf("could not read Azure profile cache at %s: %w", path, err)
	}
	for _, subscription := range profile.Subscriptions {
		if strings.TrimSpace(subscription.ID) == subscriptionID {
			return nil
		}
	}
	return fmt.Errorf(
		"Azure subscription %q is not present in your Azure CLI profile cache. Run `az login` or pick a different subscription before deploying",
		subscriptionID,
	)
}
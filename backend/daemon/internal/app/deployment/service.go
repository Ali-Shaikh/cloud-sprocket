// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

// Package deployment owns recipe catalogue helpers, OpenTofu install, deployment
// orchestration, cancellation, and related job/status notifications.
package deployment

import (
	"context"
	"errors"
	"sync"
	"time"

	"cloudsprocket/backend/daemon/internal/config"
	"cloudsprocket/backend/daemon/internal/models"
	"cloudsprocket/backend/daemon/internal/recipes"
)

var errRecipesUnavailable = errors.New("recipe catalogue is not available")

// Deps holds collaborators required to construct a deployment Service.
type Deps struct {
	Settings config.Settings
	Store    Store
	Recipes  Recipes
	Deployer Deployer
	Secrets  Secrets
	Now      func() time.Time
}

// Service owns deployment lifecycle, cancel map, and recipe/tofu handlers.
type Service struct {
	settings config.Settings
	store    Store
	recipes  Recipes
	deployer Deployer
	secrets  Secrets
	now      func() time.Time

	deployCancelsMu sync.Mutex
	deployCancels   map[string]context.CancelFunc
}

// New constructs a deployment Service. A nil Now function uses UTC wall clock.
func New(deps Deps) *Service {
	now := deps.Now
	if now == nil {
		now = func() time.Time { return time.Now().UTC() }
	}
	return &Service{
		settings: deps.Settings,
		store:    deps.Store,
		recipes:  deps.Recipes,
		deployer: deps.Deployer,
		secrets:  deps.Secrets,
		now:      now,
	}
}

func (s *Service) timestamp() string {
	return s.now().UTC().Format(time.RFC3339)
}

func (s *Service) notifyJob(notifier Notifier, job models.JobStatus) {
	if notifier != nil {
		_ = notifier.Notify("job.updated", job)
	}
}

// RecipesList returns the recipe catalogue for the recipes.list RPC.
func (s *Service) RecipesList() (any, error) {
	if s.recipes == nil {
		return nil, errRecipesUnavailable
	}
	return s.recipes.List()
}

// LoadRecipe loads a recipe by id for labs and other façade callers.
func (s *Service) LoadRecipe(id string) (recipes.Recipe, error) {
	if s.recipes == nil {
		return recipes.Recipe{}, errRecipesUnavailable
	}
	return s.recipes.Load(id)
}

// sensitiveVariableNames returns the names of a recipe's secret variables, so
// their values can be sealed at rest in the deployment record.
func sensitiveVariableNames(recipe recipes.Recipe) []string {
	var names []string
	for _, variable := range recipe.Variables {
		if variable.Sensitive || variable.Widget == "password" {
			names = append(names, variable.Name)
		}
	}
	return names
}

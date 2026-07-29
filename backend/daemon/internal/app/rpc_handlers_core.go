// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package app

import (
	"context"
	"encoding/json"
)

// registerCoreHandlers registers providers, session, workspace, preferences, app, and logs methods.
func (s *Service) registerCoreHandlers(m *handlerRegistry) {
	m.register("providers.list", func(_ context.Context, _ json.RawMessage, _ Notifier) (any, error) { return s.handleProvidersList() })
	m.register("profiles.list", func(_ context.Context, params json.RawMessage, _ Notifier) (any, error) {
		return s.handleProfilesList(params)
	})
	m.register("session.get", func(ctx context.Context, _ json.RawMessage, notifier Notifier) (any, error) {
		return s.handleSessionGet(ctx, notifier)
	})
	m.register("workspace.get", func(ctx context.Context, _ json.RawMessage, notifier Notifier) (any, error) {
		return s.handleWorkspaceGet(ctx, notifier)
	})
	m.register("session.selectProvider", func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
		return s.handleSessionSelectProvider(ctx, params, notifier)
	})
	m.register("session.selectProfile", func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
		return s.handleSessionSelectProfile(ctx, params, notifier)
	})
	m.register("session.selectAuthMethod", func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
		return s.handleSessionSelectAuthMethod(ctx, params, notifier)
	})
	m.register("session.lock", func(ctx context.Context, _ json.RawMessage, notifier Notifier) (any, error) {
		return s.handleSessionLock(ctx, notifier)
	})
	m.register("session.setWriteMode", func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
		return s.handleSessionSetWriteMode(ctx, params, notifier)
	})
	m.register("session.unlock", func(ctx context.Context, _ json.RawMessage, notifier Notifier) (any, error) {
		return s.handleSessionUnlock(ctx, notifier)
	})
	m.register("logs.list", func(ctx context.Context, params json.RawMessage, _ Notifier) (any, error) {
		return s.handleLogsList(ctx, params)
	})
	m.register("app.settings.get", func(_ context.Context, _ json.RawMessage, _ Notifier) (any, error) { return s.handleAppSettingsGet() })
	m.register("preferences.get", func(_ context.Context, _ json.RawMessage, _ Notifier) (any, error) { return s.handlePreferencesGet() })
	m.register("preferences.update", func(_ context.Context, params json.RawMessage, _ Notifier) (any, error) {
		return s.handlePreferencesUpdate(params)
	})
	m.register("preferences.hiddenResources.get", func(ctx context.Context, _ json.RawMessage, notifier Notifier) (any, error) {
		return s.handlePreferencesHiddenResourcesGet(ctx, notifier)
	})
	m.register("app.reset", func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
		return s.handleAppReset(ctx, params, notifier)
	})
}

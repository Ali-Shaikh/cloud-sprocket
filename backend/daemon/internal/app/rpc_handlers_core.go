// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package app

import (
	"context"
	"encoding/json"
)

// registerCoreHandlers registers providers, session, workspace, preferences, app, and logs methods.
func (s *Service) registerCoreHandlers(m map[string]RPCHandler) {
	m["providers.list"] = func(_ context.Context, _ json.RawMessage, _ Notifier) (any, error) { return s.handleProvidersList() }
	m["profiles.list"] = func(_ context.Context, params json.RawMessage, _ Notifier) (any, error) { return s.handleProfilesList(params) }
	m["session.get"] = func(ctx context.Context, _ json.RawMessage, notifier Notifier) (any, error) { return s.handleSessionGet(ctx, notifier) }
	m["workspace.get"] = func(ctx context.Context, _ json.RawMessage, notifier Notifier) (any, error) { return s.handleWorkspaceGet(ctx, notifier) }
	m["session.selectProvider"] = func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleSessionSelectProvider(ctx, params, notifier) }
	m["session.selectProfile"] = func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleSessionSelectProfile(ctx, params, notifier) }
	m["session.selectAuthMethod"] = func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleSessionSelectAuthMethod(ctx, params, notifier) }
	m["session.lock"] = func(ctx context.Context, _ json.RawMessage, notifier Notifier) (any, error) { return s.handleSessionLock(ctx, notifier) }
	m["session.setWriteMode"] = func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleSessionSetWriteMode(ctx, params, notifier) }
	m["session.unlock"] = func(ctx context.Context, _ json.RawMessage, notifier Notifier) (any, error) { return s.handleSessionUnlock(ctx, notifier) }
	m["logs.list"] = func(ctx context.Context, params json.RawMessage, _ Notifier) (any, error) { return s.handleLogsList(ctx, params) }
	m["app.settings.get"] = func(_ context.Context, _ json.RawMessage, _ Notifier) (any, error) { return s.handleAppSettingsGet() }
	m["preferences.get"] = func(_ context.Context, _ json.RawMessage, _ Notifier) (any, error) { return s.handlePreferencesGet() }
	m["preferences.update"] = func(_ context.Context, params json.RawMessage, _ Notifier) (any, error) { return s.handlePreferencesUpdate(params) }
	m["preferences.hiddenResources.get"] = func(ctx context.Context, _ json.RawMessage, notifier Notifier) (any, error) { return s.handlePreferencesHiddenResourcesGet(ctx, notifier) }
	m["app.reset"] = func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleAppReset(ctx, params, notifier) }
}

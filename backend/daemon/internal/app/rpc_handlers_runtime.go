// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package app

import (
	"context"
	"encoding/json"
)

// registerRuntimeHandlers registers docker, emulators, runtime, and actions methods.
func (s *Service) registerRuntimeHandlers(m map[string]RPCHandler) {
	m["runtime.get"] = func(_ context.Context, _ json.RawMessage, _ Notifier) (any, error) { return s.handleRuntimeGet() }
	m["docker.runtime.get"] = func(_ context.Context, _ json.RawMessage, _ Notifier) (any, error) { return s.handleDockerRuntimeGet() }
	m["docker.resources.list"] = func(_ context.Context, _ json.RawMessage, _ Notifier) (any, error) { return s.handleDockerResourcesList() }
	m["emulators.list"] = func(_ context.Context, _ json.RawMessage, _ Notifier) (any, error) { return s.handleEmulatorsList() }
	m["emulators.prepareProfile"] = func(_ context.Context, params json.RawMessage, _ Notifier) (any, error) { return s.handleEmulatorsPrepareProfile(params) }
	m["emulators.start"] = func(ctx context.Context, params json.RawMessage, _ Notifier) (any, error) { return s.handleEmulatorsStart(ctx, params) }
	m["emulators.stop"] = func(ctx context.Context, params json.RawMessage, _ Notifier) (any, error) { return s.handleEmulatorsStop(ctx, params) }
	m["emulators.logs"] = func(ctx context.Context, params json.RawMessage, _ Notifier) (any, error) { return s.handleEmulatorsLogs(ctx, params) }
	m["actions.invoke"] = func(_ context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleActionsInvoke(params, notifier) }
}

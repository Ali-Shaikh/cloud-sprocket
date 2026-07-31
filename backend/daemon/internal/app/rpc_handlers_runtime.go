// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package app

import (
	"context"
	"encoding/json"
	"errors"
)

// registerRuntimeHandlers registers docker, emulators, and runtime methods.
// actions.invoke is session/core behaviour and is registered in registerCoreHandlers.
func (s *Service) registerRuntimeHandlers(m *handlerRegistry) {
	m.register("runtime.get", func(ctx context.Context, _ json.RawMessage, _ Notifier) (any, error) {
		if s.rt == nil {
			return nil, errors.New("runtime service not available")
		}
		return s.rt.HandleRuntimeGet(ctx)
	})
	m.register("docker.runtime.get", func(ctx context.Context, _ json.RawMessage, _ Notifier) (any, error) {
		if s.rt == nil {
			return nil, errors.New("runtime service not available")
		}
		return s.rt.HandleDockerRuntimeGet(ctx)
	})
	m.register("docker.resources.list", func(ctx context.Context, _ json.RawMessage, _ Notifier) (any, error) {
		if s.rt == nil {
			return nil, errors.New("runtime service not available")
		}
		return s.rt.HandleDockerResourcesList(ctx)
	})
	m.register("emulators.list", func(ctx context.Context, _ json.RawMessage, _ Notifier) (any, error) {
		if s.rt == nil {
			return nil, errors.New("runtime service not available")
		}
		return s.rt.HandleEmulatorsList(ctx)
	})
	m.register("emulators.prepareProfile", func(ctx context.Context, params json.RawMessage, _ Notifier) (any, error) {
		if s.rt == nil {
			return nil, errors.New("runtime service not available")
		}
		return s.rt.HandleEmulatorsPrepareProfile(ctx, params)
	})
	m.register("emulators.start", func(ctx context.Context, params json.RawMessage, _ Notifier) (any, error) {
		if s.rt == nil {
			return nil, errors.New("runtime service not available")
		}
		return s.rt.HandleEmulatorsStart(ctx, params)
	})
	m.register("emulators.stop", func(ctx context.Context, params json.RawMessage, _ Notifier) (any, error) {
		if s.rt == nil {
			return nil, errors.New("runtime service not available")
		}
		return s.rt.HandleEmulatorsStop(ctx, params)
	})
	m.register("emulators.logs", func(ctx context.Context, params json.RawMessage, _ Notifier) (any, error) {
		if s.rt == nil {
			return nil, errors.New("runtime service not available")
		}
		return s.rt.HandleEmulatorsLogs(ctx, params)
	})
}

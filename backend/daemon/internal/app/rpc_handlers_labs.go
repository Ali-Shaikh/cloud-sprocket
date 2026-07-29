// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package app

import (
	"context"
	"encoding/json"
)

// registerLabsHandlers registers labs.* JSON-RPC methods.
func (s *Service) registerLabsHandlers(m *handlerRegistry) {
	m.register("labs.start", func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
		return s.handleLabsStart(ctx, params, notifier)
	})
	m.register("labs.get", func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
		return s.handleLabsGet(ctx, params, notifier)
	})
	m.register("labs.verifyStep", func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
		return s.handleLabsVerifyStep(ctx, params, notifier)
	})
	m.register("labs.runAction", func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
		return s.handleLabsRunAction(ctx, params, notifier)
	})
	m.register("labs.reset", func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
		return s.handleLabsReset(ctx, params, notifier)
	})
}

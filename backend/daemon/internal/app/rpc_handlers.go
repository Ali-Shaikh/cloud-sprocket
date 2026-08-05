// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package app

import (
	"context"
	"encoding/json"
	"sort"
)

// RPCHandler is the uniform signature for JSON-RPC method handlers.
// Registration replaces the former 171-case switch in Service.Handle.
type RPCHandler func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error)

type handlerRegistry struct {
	handlers map[string]RPCHandler
}

func newHandlerRegistry(capacity int) *handlerRegistry {
	return &handlerRegistry{handlers: make(map[string]RPCHandler, capacity)}
}

func (r *handlerRegistry) register(name string, handler RPCHandler) {
	if _, exists := r.handlers[name]; exists {
		panic("duplicate RPC method registration: " + name)
	}
	r.handlers[name] = handler
}

// buildMethodHandlers returns the method name -> handler map.
// Built once per Service via sync.Once (see methodHandlers).
func (s *Service) buildMethodHandlers() map[string]RPCHandler {
	// Pre-size for the known surface so the map does not rehash during register.
	registry := newHandlerRegistry(174)
	s.registerMethodHandlers(registry)
	return registry.handlers
}

func (s *Service) methodHandlers() map[string]RPCHandler {
	s.handlersOnce.Do(func() {
		s.handlers = s.buildMethodHandlers()
	})
	return s.handlers
}

// registerMethodHandlers maps every RPC method name to its Service handler.
// Domain helpers keep registration organised; method names and targets must stay stable.
func (s *Service) registerMethodHandlers(m *handlerRegistry) {
	s.registerCoreHandlers(m)
	s.registerAWSHandlers(m)
	s.registerAzureHandlers(m)
	s.registerGcpHandlers(m)
	s.registerDeployHandlers(m)
	s.registerLabsHandlers(m)
	s.registerRuntimeHandlers(m)
}

// RegisteredMethods returns the sorted list of RPC method names (for tests and docs).
func (s *Service) RegisteredMethods() []string {
	handlers := s.methodHandlers()
	names := make([]string, 0, len(handlers))
	for name := range handlers {
		names = append(names, name)
	}
	sort.Strings(names)
	return names
}

// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package app

import (
	"context"
	"encoding/json"
)

// registerGcpHandlers registers GCP Cloud Storage and Compute Engine methods.
func (s *Service) registerGcpHandlers(m *handlerRegistry) {
	m.register("gcp.compute.startInstance", func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
		return s.handleGcpComputeStartInstance(ctx, params, notifier)
	})
	m.register("gcp.compute.stopInstance", func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
		return s.handleGcpComputeStopInstance(ctx, params, notifier)
	})
	m.register("gcp.storage.deleteObject", func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
		return s.handleGcpStorageDeleteObject(ctx, params, notifier)
	})
	m.register("gcp.storage.loadMoreObjects", func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
		return s.handleGcpStorageLoadMoreObjects(ctx, params, notifier)
	})
	m.register("gcp.storage.selectBucket", func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
		return s.handleGcpStorageSelectBucket(ctx, params, notifier)
	})
	m.register("gcp.storage.setPrefixFilter", func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
		return s.handleGcpStorageSetPrefixFilter(ctx, params, notifier)
	})
	m.register("gcp.storage.uploadObject", func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
		return s.handleGcpStorageUploadObject(ctx, params, notifier)
	})
}

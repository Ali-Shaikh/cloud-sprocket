// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package app

import (
	"context"
	"strings"
	"time"
)

const (
	resourceCacheTTLRegions = 5 * time.Minute
	resourceCacheTTLList    = 60 * time.Second
	resourceCacheTTLObjects = 30 * time.Second
)

func resourceCacheTTL(scope string) time.Duration {
	if strings.HasSuffix(scope, ".regions") {
		return resourceCacheTTLRegions
	}
	if strings.Contains(scope, ".objects") ||
		strings.Contains(scope, ".blobs") ||
		strings.Contains(scope, "object-metadata") {
		return resourceCacheTTLObjects
	}
	return resourceCacheTTLList
}

func resourceCacheFresh(fetchedAt string, ttl time.Duration, now time.Time) bool {
	if strings.TrimSpace(fetchedAt) == "" {
		return false
	}
	stamp, err := time.Parse(time.RFC3339, fetchedAt)
	if err != nil {
		return false
	}
	return now.Sub(stamp.UTC()) <= ttl
}

func (s *Service) loadCachedResource(
	ctx context.Context,
	scope string,
	queryHash string,
	target any,
) (fetchedAt string, ok bool, err error) {
	fetchedAt, loaded, err := s.store.LoadResourceCache(ctx, scope, queryHash, target)
	if err != nil || !loaded {
		return fetchedAt, false, err
	}
	if !resourceCacheFresh(fetchedAt, resourceCacheTTL(scope), s.now()) {
		return fetchedAt, false, nil
	}
	return fetchedAt, true, nil
}

func (s *Service) saveResourceCacheWithTTL(
	ctx context.Context,
	scope string,
	queryHash string,
	value any,
) error {
	return s.store.SaveResourceCache(ctx, scope, queryHash, value, s.timestamp())
}

func (s *Service) invalidateResourceCache(ctx context.Context, scope string, queryHash string) {
	_ = s.store.InvalidateResourceCache(ctx, scope, queryHash)
}

func (s *Service) invalidateResourceCacheScope(ctx context.Context, scope string) {
	_ = s.store.InvalidateResourceCacheScope(ctx, scope)
}
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package models

// InventoryRun records one normalisation pass for a provider profile. Provider
// inventory collection remains owned by the existing typed adapters; this run
// tracks only the local resource-index write.
type InventoryRun struct {
	RunID         string `json:"runId"`
	ScopeID       string `json:"scopeId"`
	Provider      string `json:"provider"`
	ProfileID     string `json:"profileId"`
	StartedAt     string `json:"startedAt"`
	CompletedAt   string `json:"completedAt,omitempty"`
	Status        string `json:"status"`
	ResourceCount int    `json:"resourceCount"`
	EdgeCount     int    `json:"edgeCount"`
	ErrorMessage  string `json:"errorMessage,omitempty"`
}

// ResourceRecord is the provider-neutral, non-secret representation used by
// global inventory features. ID is stable within ScopeID. SourceRef contains a
// provider-native identifier such as an ARN when the current adapter exposes
// one.
type ResourceRecord struct {
	ID          string            `json:"id"`
	ScopeID     string            `json:"scopeId"`
	Provider    string            `json:"provider"`
	AccountID   string            `json:"accountId"`
	Region      string            `json:"region,omitempty"`
	Service     string            `json:"service"`
	Type        string            `json:"type"`
	Name        string            `json:"name"`
	Status      string            `json:"status,omitempty"`
	Tags        map[string]string `json:"tags,omitempty"`
	Attributes  map[string]string `json:"attributes,omitempty"`
	SourceRef   string            `json:"sourceRef,omitempty"`
	LastSeenAt  string            `json:"lastSeenAt"`
	Stale       bool              `json:"stale"`
	InventoryID string            `json:"inventoryRunId"`
}

// ResourceEdge is an explicitly evidenced relationship between indexed
// resources. Name-based inferred relationships are intentionally excluded.
type ResourceEdge struct {
	ScopeID     string `json:"scopeId"`
	SourceID    string `json:"sourceId"`
	TargetID    string `json:"targetId"`
	Kind        string `json:"kind"`
	Confidence  string `json:"confidence"`
	Evidence    string `json:"evidence,omitempty"`
	LastSeenAt  string `json:"lastSeenAt"`
	InventoryID string `json:"inventoryRunId"`
}

type ResourceListFilter struct {
	ScopeID      string `json:"scopeId,omitempty"`
	Provider     string `json:"provider,omitempty"`
	Service      string `json:"service,omitempty"`
	Type         string `json:"type,omitempty"`
	Status       string `json:"status,omitempty"`
	Query        string `json:"query,omitempty"`
	IncludeStale bool   `json:"includeStale,omitempty"`
	Limit        int    `json:"limit,omitempty"`
	Offset       int    `json:"offset,omitempty"`
}

type ResourceListResult struct {
	Resources  []ResourceRecord `json:"resources"`
	Total      int              `json:"total"`
	Limit      int              `json:"limit"`
	Offset     int              `json:"offset"`
	NextOffset *int             `json:"nextOffset,omitempty"`
}

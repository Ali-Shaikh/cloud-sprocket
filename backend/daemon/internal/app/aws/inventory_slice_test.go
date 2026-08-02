// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package aws

import (
	"encoding/json"
	"testing"

	"cloudsprocket/backend/daemon/internal/models"
)

func TestInventorySliceFromWorkspaceEmitsEmptyArrays(t *testing.T) {
	workspace := models.WorkspaceSnapshot{
		// Leave inventory slices nil so the projector must normalise them.
		S3Buckets: nil,
		S3Objects: nil,
	}
	slice, err := InventorySliceFromWorkspace("s3", workspace)
	if err != nil {
		t.Fatalf("InventorySliceFromWorkspace: %v", err)
	}
	if slice.ProviderID != "aws" || slice.Scope != "s3" {
		t.Fatalf("unexpected envelope: %+v", slice)
	}
	if slice.Payload.AwsS3InventoryPayload == nil {
		t.Fatal("expected S3 payload")
	}
	if slice.Payload.S3Buckets == nil || slice.Payload.S3Objects == nil {
		t.Fatal("expected empty (non-nil) S3 collection fields")
	}

	encoded, err := json.Marshal(slice)
	if err != nil {
		t.Fatalf("json.Marshal: %v", err)
	}
	var raw map[string]json.RawMessage
	if err := json.Unmarshal(encoded, &raw); err != nil {
		t.Fatalf("json.Unmarshal: %v", err)
	}
	var payload map[string]json.RawMessage
	if err := json.Unmarshal(raw["payload"], &payload); err != nil {
		t.Fatalf("payload: %v", err)
	}
	for _, key := range []string{"s3Buckets", "s3Objects", "s3ObjectMetadata", "s3ExportSnippets"} {
		if string(payload[key]) != "[]" {
			t.Fatalf("%s = %s, want []", key, payload[key])
		}
	}
}

func TestInventorySliceFromWorkspaceUnknownScope(t *testing.T) {
	_, err := InventorySliceFromWorkspace("not-a-scope", models.WorkspaceSnapshot{})
	if err == nil {
		t.Fatal("expected error for unknown scope")
	}
}

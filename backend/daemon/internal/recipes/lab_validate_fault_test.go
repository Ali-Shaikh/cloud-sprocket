// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package recipes

import (
	"strings"
	"testing"
)

func TestValidateLabSpecRejectsUnknownFaultKind(t *testing.T) {
	t.Parallel()
	manifest := Manifest{
		ID: "invalid-chaos",
		Lab: &LabSpec{Steps: []LabStep{{
			ID:    "chaos",
			Title: "Chaos",
			Fault: &LabFault{Kind: "vendor-magic", Target: "worker"},
		}}},
	}
	err := ValidateLabSpec(manifest)
	if err == nil || !strings.Contains(err.Error(), "not recognised") {
		t.Fatalf("got %v, want unknown fault validation error", err)
	}
}

func TestValidateLabSpecRequiresPauseTarget(t *testing.T) {
	t.Parallel()
	manifest := Manifest{
		ID: "invalid-pause",
		Lab: &LabSpec{Steps: []LabStep{{
			ID:    "chaos",
			Title: "Chaos",
			Fault: &LabFault{Kind: LabFaultPause},
		}}},
	}
	err := ValidateLabSpec(manifest)
	if err == nil || !strings.Contains(err.Error(), "missing target") {
		t.Fatalf("got %v, want missing target validation error", err)
	}
}

func TestValidateLabSpecAcceptsOutageProbe(t *testing.T) {
	t.Parallel()
	manifest := Manifest{
		ID: "valid-chaos",
		Lab: &LabSpec{Steps: []LabStep{{
			ID:    "chaos",
			Title: "Chaos",
			Fault: &LabFault{Kind: LabFaultPause, Target: "worker"},
			Verify: []LabVerify{{
				Type: LabVerifyHTTPUnreachable,
				URL:  "http://localhost:4566/health",
			}},
		}}},
	}
	if err := ValidateLabSpec(manifest); err != nil {
		t.Fatalf("ValidateLabSpec: %v", err)
	}
}

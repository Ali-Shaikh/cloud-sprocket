// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package tofu

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"
)

func TestFormatRunErrorProviderTimeout(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), time.Nanosecond)
	defer cancel()
	<-ctx.Done()

	output := []byte("Initializing provider plugins...\n- Installing hashicorp/azurerm v4.81.0...\n")
	err := FormatRunError(ctx, []string{"init", "-input=false"}, output, context.DeadlineExceeded)
	if err == nil {
		t.Fatal("expected annotated error")
	}
	message := err.Error()
	for _, want := range []string{"timed out", "providers", "azurerm", "Last OpenTofu output", "Installing hashicorp/azurerm"} {
		if !strings.Contains(message, want) {
			t.Fatalf("error missing %q: %s", want, message)
		}
	}
}

func TestFormatRunErrorProviderFailure(t *testing.T) {
	output := []byte("Initializing provider plugins...\n- Installing hashicorp/azurerm v4.81.0...\nError: Failed to install provider\n")
	err := FormatRunError(context.Background(), []string{"init"}, output, errors.New("exit status 1"))
	if err == nil {
		t.Fatal("expected annotated error")
	}
	if !strings.Contains(err.Error(), "installing providers") {
		t.Fatalf("expected provider install wording, got %s", err)
	}
}

func TestFormatRunErrorCancelled(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	err := FormatRunError(ctx, []string{"plan"}, nil, context.Canceled)
	if err == nil || !strings.Contains(err.Error(), "cancelled") {
		t.Fatalf("expected cancelled message, got %v", err)
	}
}

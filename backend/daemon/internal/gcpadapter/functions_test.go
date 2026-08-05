// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package gcpadapter

import (
	"context"
	"errors"
	"strings"
	"testing"

	"cloudsprocket/backend/daemon/internal/config"
)

type multiResponseCLI struct {
	// responses keyed by whether --gen2 is present.
	gen1Out []byte
	gen2Out []byte
	err     error
	calls   [][]string
}

func (f *multiResponseCLI) CommandContext(_ context.Context, name string, args ...string) ([]byte, error) {
	f.calls = append(f.calls, append([]string{name}, args...))
	if f.err != nil {
		return nil, f.err
	}
	joined := strings.Join(args, " ")
	if strings.Contains(joined, "--gen2") {
		return f.gen2Out, nil
	}
	return f.gen1Out, nil
}

func TestListFunctionsDecodesGen1AndGen2AndSorts(t *testing.T) {
	gen1 := []byte(`[
		{
			"name": "projects/platform-prod/locations/europe-west1/functions/zeta-fn",
			"status": "ACTIVE",
			"runtime": "python311",
			"httpsTrigger": {"url": "https://europe-west1-platform-prod.cloudfunctions.net/zeta-fn"},
			"updateTime": "2024-01-02T03:04:05.000Z"
		}
	]`)
	gen2 := []byte(`[
		{
			"name": "projects/platform-prod/locations/us-central1/functions/alpha-fn",
			"state": "ACTIVE",
			"environment": "GEN_2",
			"buildConfig": {"runtime": "nodejs20", "entryPoint": "hello"},
			"serviceConfig": {"uri": "https://alpha-fn-xyz-uc.a.run.app"},
			"updateTime": "2024-06-01T12:00:00.000Z"
		}
	]`)
	fake := &multiResponseCLI{gen1Out: gen1, gen2Out: gen2}
	inv := NewInventory(config.Settings{})
	inv.runner = fake

	functions, err := inv.ListFunctions(context.Background(), gcpProfile())
	if err != nil {
		t.Fatalf("ListFunctions: %v", err)
	}
	if len(functions) != 2 {
		t.Fatalf("len = %d, want 2: %+v", len(functions), functions)
	}
	if functions[0].Name != "alpha-fn" {
		t.Fatalf("first name = %q, want alpha-fn (sorted)", functions[0].Name)
	}
	if functions[0].Region != "us-central1" || functions[0].Runtime != "nodejs20" {
		t.Fatalf("alpha function = %+v", functions[0])
	}
	if functions[0].Generation != "2nd gen" || functions[0].Trigger != "HTTPS" {
		t.Fatalf("alpha generation/trigger = %+v", functions[0])
	}
	if functions[1].Name != "zeta-fn" || functions[1].Generation != "1st gen" {
		t.Fatalf("zeta function = %+v", functions[1])
	}
	if functions[1].Region != "europe-west1" || functions[1].Runtime != "python311" {
		t.Fatalf("zeta region/runtime = %+v", functions[1])
	}
	if len(fake.calls) != 2 {
		t.Fatalf("calls = %d, want 2 (gen1 + gen2)", len(fake.calls))
	}
	joined0 := strings.Join(fake.calls[0], " ")
	joined1 := strings.Join(fake.calls[1], " ")
	if !strings.Contains(joined0, "functions list") || !strings.Contains(joined1, "functions list") {
		t.Fatalf("calls missing functions list: %v", fake.calls)
	}
	if !strings.Contains(joined0+" "+joined1, "--gen2") {
		t.Fatalf("expected a --gen2 call: %v", fake.calls)
	}
	if !strings.Contains(joined0, "--project platform-prod") {
		t.Fatalf("args missing project: %v", fake.calls[0])
	}
}

func TestListFunctionsEmptyPayload(t *testing.T) {
	inv := NewInventory(config.Settings{})
	inv.runner = &multiResponseCLI{gen1Out: []byte("[]"), gen2Out: []byte("[]")}
	functions, err := inv.ListFunctions(context.Background(), gcpProfile())
	if err != nil {
		t.Fatalf("ListFunctions: %v", err)
	}
	if len(functions) != 0 {
		t.Fatalf("functions = %+v, want empty", functions)
	}
}

func TestListFunctionsCLIError(t *testing.T) {
	inv := NewInventory(config.Settings{})
	inv.runner = &multiResponseCLI{err: errors.New("exit status 1")}
	_, err := inv.ListFunctions(context.Background(), gcpProfile())
	if err == nil {
		t.Fatal("expected error")
	}
	if !strings.Contains(err.Error(), "gcloud") {
		t.Fatalf("error = %v, want gcloud prefix", err)
	}
}

func TestFunctionRegionAndShortName(t *testing.T) {
	raw := "projects/p/locations/asia-east1/functions/hello"
	if got := functionRegion(raw); got != "asia-east1" {
		t.Fatalf("functionRegion = %q, want asia-east1", got)
	}
	item := functionJSON{Name: raw}
	if got := functionShortName(item); got != "hello" {
		t.Fatalf("functionShortName = %q, want hello", got)
	}
}

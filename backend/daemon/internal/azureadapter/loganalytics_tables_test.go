// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package azureadapter

import (
	"context"
	"fmt"
	"strings"
	"testing"

	"cloudsprocket/backend/daemon/internal/config"
)

type countingCLI struct {
	fakeCLI
	queryCalls int
}

func (c *countingCLI) CommandContext(ctx context.Context, name string, args ...string) ([]byte, error) {
	joined := strings.Join(args, " ")
	if strings.Contains(joined, "log-analytics query") {
		c.queryCalls++
	}
	if strings.Contains(joined, "workspace table list") {
		tables := make([]string, 0, 40)
		for index := 0; index < 40; index++ {
			tables = append(tables, fmt.Sprintf(`{"name":"Table%d"}`, index))
		}
		return []byte("[" + strings.Join(tables, ",") + "]"), nil
	}
	return c.fakeCLI.CommandContext(ctx, name, args...)
}

func TestListLogAnalyticsTablesSkipsColumnFanOutWhenManyTables(t *testing.T) {
	cli := &countingCLI{}
	inv := NewInventory(config.Settings{})
	inv.runner = cli

	tables, err := inv.ListLogAnalyticsTables(
		context.Background(),
		cloudAzureProfile(),
		"erw-shared-afd-law",
		"aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
		"demo-rg",
		true,
	)
	if err != nil {
		t.Fatalf("ListLogAnalyticsTables: %v", err)
	}
	if len(tables) != 40 {
		t.Fatalf("tables = %d, want 40", len(tables))
	}
	if cli.queryCalls != 0 {
		t.Fatalf("expected no getschema queries for large workspaces, got %d", cli.queryCalls)
	}
}

func TestListLogAnalyticsTablesCloudNamesOnly(t *testing.T) {
	cli := &fakeCLI{out: []byte(`[{"name":"AzureDiagnostics"},{"name":"AppEvents"}]`)}
	inv := NewInventory(config.Settings{})
	inv.runner = cli

	tables, err := inv.ListLogAnalyticsTables(
		context.Background(),
		cloudAzureProfile(),
		"erw-shared-afd-law",
		"aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
		"demo-rg",
		false,
	)
	if err != nil {
		t.Fatalf("ListLogAnalyticsTables: %v", err)
	}
	if len(tables) != 2 || tables[0].Name != "AzureDiagnostics" || tables[1].Name != "AppEvents" {
		t.Fatalf("unexpected tables: %+v", tables)
	}
	joined := strings.Join(cli.args, " ")
	if !strings.Contains(joined, "workspace table list") || !strings.Contains(joined, "erw-shared-afd-law") {
		t.Fatalf("expected workspace table list call, got %v", cli.args)
	}
}
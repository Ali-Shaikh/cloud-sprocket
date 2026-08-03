// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package azureadapter

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"cloudsprocket/backend/daemon/internal/config"
)

func TestListPostgresServersLocalFloci(t *testing.T) {
	server := newFlociTestServer(t)
	inv := newLocalInventory(server.URL)

	servers, err := inv.ListPostgresServers(context.Background(), localFlociProfile())
	if err != nil {
		t.Fatalf("ListPostgresServers: %v", err)
	}
	if len(servers) != 1 || servers[0].Name != "lab-dev-pg" || servers[0].ResourceGroup != "app-rg" {
		t.Fatalf("servers = %+v", servers)
	}
	if servers[0].Version != "17" || servers[0].AdministratorLogin != "psqladmin" {
		t.Fatalf("unexpected server fields: %+v", servers[0])
	}
}

func TestGetPostgresConnectionLocalFloci(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasSuffix(r.URL.Path, "/devstoreaccount1-postgres/flexibleServers/lab-dev-pg/connect") {
			w.Header().Set("Content-Type", "application/json")
			_, _ = io.WriteString(w, `{"server":"lab-dev-pg","host":"localhost","port":54983,"jdbcUrl":"jdbc:postgresql://localhost:54983/postgres?user=psqladmin&password=secret&sslmode=disable","uri":"postgresql://psqladmin:secret@localhost:54983/postgres?sslmode=disable","psql":"psql \"host=localhost port=54983 dbname=postgres user=psqladmin password=secret sslmode=disable\"","dotNet":"Host=localhost;Port=54983;Database=postgres;Username=psqladmin;Password=secret;SSL Mode=Disable;"}`)
			return
		}
		http.NotFound(w, r)
	}))
	t.Cleanup(server.Close)

	inv := newLocalInventory(server.URL)
	conn, err := inv.GetPostgresConnection(context.Background(), localFlociProfile(), "lab-rg", "lab-dev-pg")
	if err != nil {
		t.Fatalf("GetPostgresConnection: %v", err)
	}
	if conn.Host != "localhost" || conn.Port != 54983 {
		t.Fatalf("connection = %+v", conn)
	}
	if !strings.Contains(conn.URI, "sslmode=disable") {
		t.Fatalf("expected local sslmode=disable, got %q", conn.URI)
	}
}

func TestListPostgresServersCloud(t *testing.T) {
	fake := &fakeCLI{out: []byte(`[{"name":"prod-pg","resourceGroup":"rg-data","location":"westeurope","version":"16","administratorLogin":"psqladmin","skuName":"Standard_B1ms","storageProfile":{"storageMB":32768},"fullyQualifiedDomainName":"prod-pg.postgres.database.azure.com","state":"Ready"}]`)}
	inv := NewInventory(config.Settings{})
	inv.runner = fake

	servers, err := inv.ListPostgresServers(context.Background(), cloudAzureProfile())
	if err != nil {
		t.Fatalf("ListPostgresServers cloud: %v", err)
	}
	if len(servers) != 1 || servers[0].ResourceGroup != "rg-data" || servers[0].FQDN == "" {
		t.Fatalf("unexpected cloud servers: %+v", servers)
	}
	if !strings.Contains(strings.Join(fake.args, " "), "postgres flexible-server list") {
		t.Fatalf("unexpected az args: %v", fake.args)
	}
}

func TestGetPostgresConnectionCloud(t *testing.T) {
	fake := &fakeCLI{out: []byte(`{"fullyQualifiedDomainName":"prod-pg.postgres.database.azure.com","administratorLogin":"psqladmin"}`)}
	inv := NewInventory(config.Settings{})
	inv.runner = fake

	conn, err := inv.GetPostgresConnection(context.Background(), cloudAzureProfile(), "rg-data", "prod-pg")
	if err != nil {
		t.Fatalf("GetPostgresConnection cloud: %v", err)
	}
	if conn.Port != 5432 || !strings.Contains(conn.URI, "sslmode=require") {
		t.Fatalf("unexpected cloud connection: %+v", conn)
	}
	if conn.Note == "" {
		t.Fatal("expected cloud connection note about password")
	}
}

func TestParsePostgresLifecycleAction(t *testing.T) {
	start, err := parsePostgresLifecycleAction(" start ")
	if err != nil || start != "start" {
		t.Fatalf("start = %q err=%v", start, err)
	}
	stop, err := parsePostgresLifecycleAction("STOP")
	if err != nil || stop != "stop" {
		t.Fatalf("stop = %q err=%v", stop, err)
	}
	if _, err := parsePostgresLifecycleAction("restart"); err == nil {
		t.Fatal("expected unsupported action error")
	}
}

func TestStartPostgresServerCloud(t *testing.T) {
	fake := &fakeCLI{out: []byte(`{}`)}
	inv := NewInventory(config.Settings{})
	inv.runner = fake

	result, err := inv.StartPostgresServer(context.Background(), cloudAzureProfile(), "rg-data", "prod-pg")
	if err != nil {
		t.Fatalf("StartPostgresServer: %v", err)
	}
	if result.Action != "start" || result.ServerName != "prod-pg" || result.Summary == "" {
		t.Fatalf("result = %+v", result)
	}
	joined := strings.Join(fake.args, " ")
	if !strings.Contains(joined, "postgres flexible-server start") ||
		!strings.Contains(joined, "--name prod-pg") {
		t.Fatalf("unexpected az args: %v", fake.args)
	}
}

func TestStopPostgresServerCloud(t *testing.T) {
	fake := &fakeCLI{out: []byte(`{}`)}
	inv := NewInventory(config.Settings{})
	inv.runner = fake

	result, err := inv.StopPostgresServer(context.Background(), cloudAzureProfile(), "rg-data", "prod-pg")
	if err != nil {
		t.Fatalf("StopPostgresServer: %v", err)
	}
	if result.Action != "stop" {
		t.Fatalf("result = %+v", result)
	}
	if !strings.Contains(strings.Join(fake.args, " "), "postgres flexible-server stop") {
		t.Fatalf("unexpected az args: %v", fake.args)
	}
}

func TestStartPostgresServerLocalFloci(t *testing.T) {
	var sawPath string
	var sawMethod string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		sawPath = r.URL.Path
		sawMethod = r.Method
		w.WriteHeader(http.StatusAccepted)
	}))
	t.Cleanup(server.Close)

	inv := newLocalInventory(server.URL)
	result, err := inv.StartPostgresServer(context.Background(), localFlociProfile(), "app-rg", "lab-dev-pg")
	if err != nil {
		t.Fatalf("StartPostgresServer local: %v", err)
	}
	if result.Action != "start" || result.ResourceGroup != "app-rg" {
		t.Fatalf("result = %+v", result)
	}
	if sawMethod != http.MethodPost {
		t.Fatalf("method = %s", sawMethod)
	}
	if !strings.Contains(sawPath, "/flexibleServers/lab-dev-pg/start") {
		t.Fatalf("path = %s", sawPath)
	}
}

func TestInvokePostgresLifecycleRequiresNames(t *testing.T) {
	inv := NewInventory(config.Settings{})
	if _, err := inv.StartPostgresServer(context.Background(), cloudAzureProfile(), "", "prod-pg"); err == nil {
		t.Fatal("expected resource group required")
	}
	if _, err := inv.StopPostgresServer(context.Background(), cloudAzureProfile(), "rg", ""); err == nil {
		t.Fatal("expected server name required")
	}
}
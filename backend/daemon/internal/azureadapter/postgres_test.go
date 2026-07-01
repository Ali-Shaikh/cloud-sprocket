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
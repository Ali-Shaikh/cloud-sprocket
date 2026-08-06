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

func TestCosmosAuthHeader(t *testing.T) {
	header, err := cosmosAuthHeader("GET", "dbs", "", "Tue, 01 Nov 2022 00:00:00 GMT", wellKnownCosmosKey)
	if err != nil {
		t.Fatalf("cosmosAuthHeader: %v", err)
	}
	if !strings.HasPrefix(header, "type%3Dmaster") {
		t.Fatalf("unexpected auth header: %q", header)
	}
}

func TestCosmosBrowseLocalFloci(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch {
		case strings.HasSuffix(r.URL.Path, "/devstoreaccount1-cosmos/dbs"):
			_, _ = io.WriteString(w, `{"Databases":[{"id":"appdb"}],"_count":1}`)
		case strings.HasSuffix(r.URL.Path, "/dbs/appdb/colls"):
			_, _ = io.WriteString(w, `{"DocumentCollections":[{"id":"orders","partitionKey":{"paths":["/customerId"]}}],"_count":1}`)
		case strings.HasSuffix(r.URL.Path, "/dbs/appdb/colls/orders/docs"):
			_, _ = io.WriteString(w, `{"Documents":[{"id":"doc-1","total":42}],"_count":1}`)
		default:
			http.NotFound(w, r)
		}
	}))
	t.Cleanup(server.Close)

	inv := newLocalInventory(server.URL)
	profile := localFlociProfile()

	accounts, err := inv.ListCosmosAccounts(context.Background(), profile)
	if err != nil || len(accounts) != 1 || accounts[0].Name != "devstoreaccount1" {
		t.Fatalf("accounts = %+v, err %v", accounts, err)
	}

	dbs, err := inv.ListCosmosDatabases(context.Background(), profile, "devstoreaccount1", "")
	if err != nil || len(dbs) != 1 || dbs[0].Name != "appdb" {
		t.Fatalf("databases = %+v, err %v", dbs, err)
	}

	colls, err := inv.ListCosmosContainers(context.Background(), profile, "devstoreaccount1", "", "appdb")
	if err != nil || len(colls) != 1 || colls[0].Name != "orders" || colls[0].PartitionKey != "/customerId" {
		t.Fatalf("containers = %+v, err %v", colls, err)
	}

	items, err := inv.ListCosmosItems(context.Background(), profile, "devstoreaccount1", "", "appdb", "orders")
	if err != nil || len(items) != 1 || items[0].ID != "doc-1" {
		t.Fatalf("items = %+v, err %v", items, err)
	}
	if !strings.Contains(items[0].JSON, `"total":42`) {
		t.Fatalf("item JSON missing fields: %q", items[0].JSON)
	}
}

func TestListCosmosAccountsCloud(t *testing.T) {
	fake := &fakeCLI{out: []byte(`[{"name":"prod-cosmos","resourceGroup":"rg-data","documentEndpoint":"https://prod-cosmos.documents.azure.com:443/"}]`)}
	inv := NewInventory(config.Settings{})
	inv.runner = fake

	accounts, err := inv.ListCosmosAccounts(context.Background(), cloudAzureProfile())
	if err != nil {
		t.Fatalf("ListCosmosAccounts cloud: %v", err)
	}
	if len(accounts) != 1 || accounts[0].ResourceGroup != "rg-data" {
		t.Fatalf("unexpected cloud accounts: %+v", accounts)
	}
	if !strings.Contains(strings.Join(fake.args, " "), "cosmosdb list") {
		t.Fatalf("unexpected az args: %v", fake.args)
	}
}

func TestDeleteCosmosItemLocalFloci(t *testing.T) {
	var sawDelete bool
	var partitionHeader string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodDelete && strings.HasSuffix(r.URL.Path, "/dbs/appdb/colls/orders/docs/doc-1") {
			sawDelete = true
			partitionHeader = r.Header.Get("x-ms-documentdb-partitionkey")
			w.WriteHeader(http.StatusNoContent)
			return
		}
		http.NotFound(w, r)
	}))
	t.Cleanup(server.Close)

	inv := newLocalInventory(server.URL)
	result, err := inv.DeleteCosmosItem(
		context.Background(),
		localFlociProfile(),
		"devstoreaccount1",
		"",
		"appdb",
		"orders",
		"doc-1",
		"cust-9",
	)
	if err != nil {
		t.Fatalf("DeleteCosmosItem: %v", err)
	}
	if !sawDelete {
		t.Fatal("expected DELETE request")
	}
	if partitionHeader != `["cust-9"]` {
		t.Fatalf("partition header = %q", partitionHeader)
	}
	if result.ItemID != "doc-1" || result.Summary == "" {
		t.Fatalf("result = %+v", result)
	}
}

func TestDeleteCosmosItemRequiresFields(t *testing.T) {
	inv := NewInventory(config.Settings{})
	_, err := inv.DeleteCosmosItem(context.Background(), localFlociProfile(), "", "", "db", "c", "id", "pk")
	if err == nil {
		t.Fatal("expected missing account error")
	}
}

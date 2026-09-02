// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package azureadapter

import (
	"context"
	"encoding/json"
	"fmt"
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

func TestNormaliseCosmosQuery(t *testing.T) {
	if _, err := NormaliseCosmosQuery("  "); err == nil {
		t.Fatal("expected empty query error")
	}
	got, err := NormaliseCosmosQuery("  SELECT * FROM c  ")
	if err != nil || got != "SELECT * FROM c" {
		t.Fatalf("got %q err %v", got, err)
	}
	tooLong := strings.Repeat("x", cosmosQueryMaxRunes+1)
	if _, err := NormaliseCosmosQuery(tooLong); err == nil {
		t.Fatal("expected oversized query error")
	}
}

func TestQueryCosmosItemsLocalFloci(t *testing.T) {
	var sawQuery bool
	var contentType string
	var isQuery string
	var crossPartition string
	var body string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost && strings.HasSuffix(r.URL.Path, "/dbs/appdb/colls/orders/docs") {
			sawQuery = true
			contentType = r.Header.Get("Content-Type")
			isQuery = r.Header.Get("x-ms-documentdb-isquery")
			crossPartition = r.Header.Get("x-ms-documentdb-query-enablecrosspartition")
			raw, _ := io.ReadAll(r.Body)
			body = string(raw)
			w.Header().Set("Content-Type", "application/json")
			_, _ = io.WriteString(w, `{"Documents":[{"id":"match-1","customerId":"c-9","total":99}],"_count":1}`)
			return
		}
		http.NotFound(w, r)
	}))
	t.Cleanup(server.Close)

	inv := newLocalInventory(server.URL)
	result, err := inv.QueryCosmosItems(
		context.Background(),
		localFlociProfile(),
		"devstoreaccount1",
		"",
		"appdb",
		"orders",
		"SELECT * FROM c WHERE c.total > 10",
	)
	if err != nil {
		t.Fatalf("QueryCosmosItems: %v", err)
	}
	if !sawQuery {
		t.Fatal("expected query POST")
	}
	if contentType != "application/query+json" || isQuery != "True" {
		t.Fatalf("headers content-type=%q isquery=%q", contentType, isQuery)
	}
	if crossPartition != "True" {
		t.Fatalf("cross-partition = %q", crossPartition)
	}
	var posted struct {
		Query string `json:"query"`
	}
	if err := json.Unmarshal([]byte(body), &posted); err != nil {
		t.Fatalf("decode query body: %v (%q)", err, body)
	}
	if posted.Query != "SELECT * FROM c WHERE c.total > 10" {
		t.Fatalf("posted query = %q", posted.Query)
	}
	if result.Query != "SELECT * FROM c WHERE c.total > 10" {
		t.Fatalf("query = %q", result.Query)
	}
	if len(result.Items) != 1 || result.Items[0].ID != "match-1" {
		t.Fatalf("items = %+v", result.Items)
	}
	if !strings.Contains(result.Items[0].JSON, `"total":99`) {
		t.Fatalf("json = %q", result.Items[0].JSON)
	}
	if result.Truncated {
		t.Fatal("expected a short result not to be truncated")
	}
}

func TestQueryCosmosItemsHTTPError(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost {
			w.WriteHeader(http.StatusBadRequest)
			_, _ = io.WriteString(w, `{"message":"syntax error near WHERE"}`)
			return
		}
		http.NotFound(w, r)
	}))
	t.Cleanup(server.Close)

	inv := newLocalInventory(server.URL)
	_, err := inv.QueryCosmosItems(
		context.Background(),
		localFlociProfile(),
		"devstoreaccount1",
		"",
		"appdb",
		"orders",
		"SELECT * FROM c WHERE",
	)
	if err == nil || !strings.Contains(err.Error(), "syntax error") {
		t.Fatalf("err = %v", err)
	}
}

func TestQueryCosmosItemsTruncatesOnContinuation(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("x-ms-continuation", "token-2")
		_, _ = io.WriteString(w, `{"Documents":[{"id":"doc-1"}]}`)
	}))
	t.Cleanup(server.Close)

	inv := newLocalInventory(server.URL)
	result, err := inv.QueryCosmosItems(
		context.Background(),
		localFlociProfile(),
		"devstoreaccount1",
		"",
		"appdb",
		"orders",
		"SELECT * FROM c",
	)
	if err != nil {
		t.Fatalf("QueryCosmosItems: %v", err)
	}
	if !result.Truncated || len(result.Items) != 1 {
		t.Fatalf("truncated=%v items=%d", result.Truncated, len(result.Items))
	}
	if !strings.Contains(result.Summary, "capped") {
		t.Fatalf("summary = %q", result.Summary)
	}
}

func TestQueryCosmosItemsDoesNotTruncateCompletePage(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		docs := make([]string, cosmosQueryMaxItems)
		for i := range docs {
			docs[i] = fmt.Sprintf(`{"id":"doc-%d"}`, i)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(w, `{"Documents":[`+strings.Join(docs, ",")+`]}`)
	}))
	t.Cleanup(server.Close)

	inv := newLocalInventory(server.URL)
	result, err := inv.QueryCosmosItems(
		context.Background(),
		localFlociProfile(),
		"devstoreaccount1",
		"",
		"appdb",
		"orders",
		"SELECT * FROM c",
	)
	if err != nil {
		t.Fatalf("QueryCosmosItems: %v", err)
	}
	if result.Truncated || len(result.Items) != cosmosQueryMaxItems {
		t.Fatalf("truncated=%v items=%d", result.Truncated, len(result.Items))
	}
}

func TestQueryCosmosItemsRequiresFields(t *testing.T) {
	inv := NewInventory(config.Settings{})
	_, err := inv.QueryCosmosItems(context.Background(), localFlociProfile(), "", "", "db", "c", "SELECT * FROM c")
	if err == nil {
		t.Fatal("expected missing account error")
	}
}

func TestDeleteCosmosItemRequiresFields(t *testing.T) {
	inv := NewInventory(config.Settings{})
	_, err := inv.DeleteCosmosItem(context.Background(), localFlociProfile(), "", "", "db", "c", "id", "pk")
	if err == nil {
		t.Fatal("expected missing account error")
	}
}

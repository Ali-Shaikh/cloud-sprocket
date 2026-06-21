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

func TestListFunctionAppsLocalFloci(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !strings.Contains(strings.ToLower(r.URL.Path), "microsoft.web/sites") {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(w, `{"value":[
			{"name":"orders-fn","location":"westeurope","kind":"functionapp,linux","properties":{"state":"Running","defaultHostName":"orders-fn.localhost"}},
			{"name":"web-site","location":"westeurope","kind":"app,linux","properties":{"state":"Running"}}
		]}`)
	}))
	t.Cleanup(server.Close)

	inv := newLocalInventory(server.URL)
	apps, err := inv.ListFunctionApps(context.Background(), localFlociProfile())
	if err != nil {
		t.Fatalf("ListFunctionApps: %v", err)
	}
	if len(apps) != 1 || apps[0].Name != "orders-fn" {
		t.Fatalf("expected only the function app, got %+v", apps)
	}
	if apps[0].DefaultHostName != "orders-fn.localhost" {
		t.Fatalf("unexpected host: %q", apps[0].DefaultHostName)
	}
}

func TestListFunctionsLocalFloci(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !strings.Contains(r.URL.Path, "/admin/apps/orders-fn/functions") {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(w, `[
			{"name":"createOrder","config":{"bindings":[{"type":"httpTrigger","direction":"in"}]}},
			{"name":"timerCleanup","config":{"bindings":[{"type":"timerTrigger","direction":"in"}]}}
		]`)
	}))
	t.Cleanup(server.Close)

	inv := newLocalInventory(server.URL)
	functions, err := inv.ListFunctions(context.Background(), localFlociProfile(), "", "orders-fn")
	if err != nil {
		t.Fatalf("ListFunctions: %v", err)
	}
	if len(functions) != 2 || functions[0].Name != "createOrder" || functions[0].Trigger != "httpTrigger" {
		t.Fatalf("unexpected functions: %+v", functions)
	}
}

func TestInvokeFunctionLocalFloci(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost || !strings.Contains(r.URL.Path, "/api/orders-fn/createOrder") {
			http.NotFound(w, r)
			return
		}
		body, _ := io.ReadAll(r.Body)
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("echo:" + string(body)))
	}))
	t.Cleanup(server.Close)

	inv := newLocalInventory(server.URL)
	result, err := inv.InvokeFunction(context.Background(), localFlociProfile(), "", "orders-fn", "createOrder", `{"id":1}`)
	if err != nil {
		t.Fatalf("InvokeFunction: %v", err)
	}
	if result.StatusCode != 200 || result.Body != `echo:{"id":1}` {
		t.Fatalf("unexpected invoke result: %+v", result)
	}
}

func TestListFunctionAppsCloud(t *testing.T) {
	fake := &fakeCLI{out: []byte(`[{"name":"orders-fn","resourceGroup":"rg-app","location":"uaenorth","state":"Running","defaultHostName":"orders-fn.azurewebsites.net"}]`)}
	inv := NewInventory(config.Settings{})
	inv.runner = fake

	apps, err := inv.ListFunctionApps(context.Background(), cloudAzureProfile())
	if err != nil {
		t.Fatalf("ListFunctionApps cloud: %v", err)
	}
	if len(apps) != 1 || apps[0].ResourceGroup != "rg-app" {
		t.Fatalf("unexpected cloud apps: %+v", apps)
	}
	if !strings.Contains(strings.Join(fake.args, " "), "functionapp list") {
		t.Fatalf("unexpected az args: %v", fake.args)
	}
}

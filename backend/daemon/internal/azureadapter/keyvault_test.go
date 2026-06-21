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

func TestListKeyVaultsLocalFloci(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !strings.Contains(strings.ToLower(r.URL.Path), "microsoft.keyvault/vaults") {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(w, `{"value":[{"name":"app-vault","location":"westeurope","properties":{"vaultUri":"http://localhost:4577/app-vault-keyvault"}}]}`)
	}))
	t.Cleanup(server.Close)

	inv := newLocalInventory(server.URL)
	vaults, err := inv.ListKeyVaults(context.Background(), localFlociProfile())
	if err != nil {
		t.Fatalf("ListKeyVaults: %v", err)
	}
	if len(vaults) != 1 || vaults[0].Name != "app-vault" {
		t.Fatalf("unexpected vaults: %+v", vaults)
	}
}

func TestKeyVaultSecretLifecycleLocalFloci(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch {
		case strings.HasSuffix(r.URL.Path, "/app-vault-keyvault/secrets") && r.Method == http.MethodGet:
			_, _ = io.WriteString(w, `{"value":[{"id":"http://x/app-vault-keyvault/secrets/db-password","attributes":{"enabled":true}}]}`)
		case strings.Contains(r.URL.Path, "/app-vault-keyvault/secrets/db-password") && r.Method == http.MethodGet:
			_, _ = io.WriteString(w, `{"value":"s3cr3t","id":"http://x/app-vault-keyvault/secrets/db-password","attributes":{"enabled":true}}`)
		case strings.Contains(r.URL.Path, "/app-vault-keyvault/secrets/api-key") && r.Method == http.MethodPut:
			_, _ = io.WriteString(w, `{"id":"http://x/app-vault-keyvault/secrets/api-key","attributes":{"enabled":true}}`)
		default:
			http.NotFound(w, r)
		}
	}))
	t.Cleanup(server.Close)

	inv := newLocalInventory(server.URL)
	profile := localFlociProfile()

	secrets, err := inv.ListKeyVaultSecrets(context.Background(), profile, "app-vault")
	if err != nil {
		t.Fatalf("ListKeyVaultSecrets: %v", err)
	}
	if len(secrets) != 1 || secrets[0].Name != "db-password" || !secrets[0].Enabled {
		t.Fatalf("unexpected secrets: %+v", secrets)
	}

	value, err := inv.GetKeyVaultSecret(context.Background(), profile, "app-vault", "db-password")
	if err != nil {
		t.Fatalf("GetKeyVaultSecret: %v", err)
	}
	if value != "s3cr3t" {
		t.Fatalf("expected secret value, got %q", value)
	}

	created, err := inv.SetKeyVaultSecret(context.Background(), profile, "app-vault", "api-key", "abc123")
	if err != nil {
		t.Fatalf("SetKeyVaultSecret: %v", err)
	}
	if created.Name != "api-key" || !created.Enabled {
		t.Fatalf("unexpected set result: %+v", created)
	}
}

func TestListKeyVaultsCloud(t *testing.T) {
	fake := &fakeCLI{out: []byte(`[{"name":"prod-vault","resourceGroup":"rg-sec","location":"uaenorth","properties":{"vaultUri":"https://prod-vault.vault.azure.net/"}}]`)}
	inv := NewInventory(config.Settings{})
	inv.runner = fake

	vaults, err := inv.ListKeyVaults(context.Background(), cloudAzureProfile())
	if err != nil {
		t.Fatalf("ListKeyVaults cloud: %v", err)
	}
	if len(vaults) != 1 || vaults[0].ResourceGroup != "rg-sec" || vaults[0].VaultURI == "" {
		t.Fatalf("unexpected cloud vaults: %+v", vaults)
	}
	if !strings.Contains(strings.Join(fake.args, " "), "keyvault list") {
		t.Fatalf("unexpected az args: %v", fake.args)
	}
}

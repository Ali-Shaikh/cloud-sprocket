// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package deploy

import (
	"context"
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/pem"
	"math/big"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"cloudsprocket/backend/daemon/internal/config"
	"cloudsprocket/backend/daemon/internal/flociazcompat"
	"cloudsprocket/backend/daemon/internal/recipes"
	"cloudsprocket/backend/daemon/internal/tofu"
)

func TestPreflightLocalStackReachable(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/_localstack/health" {
			t.Errorf("unexpected probe path %q", r.URL.Path)
		}
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	e := NewEngine(tofu.NewRunner("tofu"), config.Settings{}, recipes.Bundled())
	e.registry.SetOptions(TargetOptions{LocalStackEndpoint: server.URL})

	if err := e.Preflight(context.Background(), &Deployment{ProviderID: "aws", Local: true}); err != nil {
		t.Fatalf("expected reachable LocalStack to pass preflight, got %v", err)
	}
}

func TestPreflightLocalStackUnreachable(t *testing.T) {
	e := NewEngine(tofu.NewRunner("tofu"), config.Settings{}, recipes.Bundled())
	// A closed port: nothing is listening, so the probe must fail fast.
	e.registry.SetOptions(TargetOptions{LocalStackEndpoint: "http://127.0.0.1:1"})

	err := e.Preflight(context.Background(), &Deployment{ProviderID: "aws", Local: true})
	if err == nil {
		t.Fatal("expected an unreachable LocalStack to fail preflight")
	}
	if !strings.Contains(err.Error(), "not reachable") {
		t.Fatalf("expected an actionable message, got %q", err)
	}
}

func TestPreflightAWSProfileConfigured(t *testing.T) {
	dir := t.TempDir()
	credsPath := filepath.Join(dir, "credentials")
	if err := os.WriteFile(credsPath, []byte("[prod]\naws_access_key_id = AKIA\n"), 0o600); err != nil {
		t.Fatalf("write credentials: %v", err)
	}
	e := NewEngine(tofu.NewRunner("tofu"), config.Settings{AWSCredentialsPath: credsPath}, recipes.Bundled())

	if err := e.Preflight(context.Background(), &Deployment{ProviderID: "aws", ProfileID: "prod"}); err != nil {
		t.Fatalf("expected a configured profile to pass, got %v", err)
	}
	if err := e.Preflight(context.Background(), &Deployment{ProviderID: "aws", ProfileID: "missing"}); err == nil {
		t.Fatal("expected an unknown profile to fail preflight")
	}
}

func TestPreflightAzureSubscriptionConfigured(t *testing.T) {
	dir := t.TempDir()
	azureDir := filepath.Join(dir, "azure")
	if err := os.MkdirAll(azureDir, 0o755); err != nil {
		t.Fatalf("mkdir azure: %v", err)
	}
	profilePath := filepath.Join(azureDir, "azureProfile.json")
	if err := os.WriteFile(profilePath, []byte(`{"subscriptions":[{"id":"sub-001","name":"Marketing"}]}`), 0o600); err != nil {
		t.Fatalf("write azure profile: %v", err)
	}
	settings := config.Settings{AzureDir: azureDir}
	e := NewEngine(tofu.NewRunner("tofu"), settings, recipes.Bundled())

	if err := e.Preflight(context.Background(), &Deployment{ProviderID: "azure", ProfileID: "sub-001"}); err != nil {
		t.Fatalf("expected a configured subscription to pass, got %v", err)
	}
	if err := e.Preflight(context.Background(), &Deployment{ProviderID: "azure", ProfileID: "missing"}); err == nil {
		t.Fatal("expected an unknown subscription to fail preflight")
	}
}

func TestPreflightAzureRejectsFlociProfileOnCloudTarget(t *testing.T) {
	e := NewEngine(tofu.NewRunner("tofu"), config.Settings{}, recipes.Bundled())
	err := e.Preflight(context.Background(), &Deployment{
		ProviderID: "azure",
		ProfileID:  flociazcompat.LocalProfileID,
	})
	if err == nil {
		t.Fatal("expected floci profile on cloud target to fail preflight")
	}
	if !strings.Contains(err.Error(), "floci-az") {
		t.Fatalf("expected actionable floci message, got %q", err)
	}
}

func TestPreflightRejectsMagentoAzureOnFlociLocal(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	e := NewEngine(tofu.NewRunner("tofu"), config.Settings{}, recipes.Bundled())
	e.registry.SetOptions(TargetOptions{FlociAzEndpoint: server.URL})

	err := e.Preflight(context.Background(), &Deployment{
		ProviderID: "azure",
		RecipeID:   "magento-commerce-azure",
		Local:      true,
		RuntimeID:  "floci-az",
	})
	if err == nil {
		t.Fatal("expected magento-commerce-azure on floci-az to fail preflight")
	}
	if !strings.Contains(err.Error(), "does not support a local floci-az dry-run") {
		t.Fatalf("expected recipe compat message, got %q", err)
	}
}

func TestPreflightRejectsMagentoAWSOnLocalStack(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	e := NewEngine(tofu.NewRunner("tofu"), config.Settings{}, recipes.Bundled())
	e.registry.SetOptions(TargetOptions{LocalStackEndpoint: server.URL})

	err := e.Preflight(context.Background(), &Deployment{
		ProviderID: "aws",
		RecipeID:   "magento-commerce-aws",
		Local:      true,
		RuntimeID:  "localstack",
	})
	if err == nil {
		t.Fatal("expected magento-commerce-aws on localstack to fail preflight")
	}
	if !strings.Contains(err.Error(), "does not support a local LocalStack dry-run") {
		t.Fatalf("expected recipe compat message, got %q", err)
	}
}

func TestPreflightFlociAzValidatesOpenTofuContract(t *testing.T) {
	certPEM := localhostFlociTestCert(t)
	metadata := `{"resourceManager":"http://127.0.0.1:0"}`

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/":
			w.WriteHeader(http.StatusOK)
		case "/metadata/endpoints":
			_, _ = w.Write([]byte(metadata))
		case "/_floci/tls-cert":
			_, _ = w.Write(certPEM)
		default:
			w.WriteHeader(http.StatusNotFound)
		}
	}))
	defer server.Close()

	e := NewEngine(tofu.NewRunner("tofu"), config.Settings{LocalConfigDir: t.TempDir()}, recipes.Bundled())
	e.registry.SetOptions(TargetOptions{FlociAzEndpoint: server.URL})

	err := e.Preflight(context.Background(), &Deployment{
		ProviderID: "azure",
		RecipeID:   "lab-postgres-flexible-azure",
		Local:      true,
		RuntimeID:  "floci-az",
	})
	if err == nil {
		t.Fatal("expected floci-az preflight to fail when HTTPS metadata probe cannot succeed")
	}
	if !strings.Contains(err.Error(), "HTTPS") {
		t.Fatalf("expected HTTPS metadata contract failure, got %q", err)
	}
}

func localhostFlociTestCert(t *testing.T) []byte {
	t.Helper()
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatalf("generate key: %v", err)
	}
	template := x509.Certificate{
		SerialNumber: big.NewInt(1),
		Subject:      pkix.Name{CommonName: "localhost"},
		NotBefore:    time.Now().Add(-time.Hour),
		NotAfter:     time.Now().Add(time.Hour),
		KeyUsage:     x509.KeyUsageDigitalSignature | x509.KeyUsageKeyEncipherment,
		ExtKeyUsage:  []x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth},
		IPAddresses:  []net.IP{net.ParseIP("127.0.0.1")},
		DNSNames:     []string{"localhost"},
	}
	der, err := x509.CreateCertificate(rand.Reader, &template, &template, &key.PublicKey, key)
	if err != nil {
		t.Fatalf("create cert: %v", err)
	}
	return pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: der})
}

func TestPreflightAWSProfileFromConfigFile(t *testing.T) {
	dir := t.TempDir()
	configPath := filepath.Join(dir, "config")
	if err := os.WriteFile(configPath, []byte("[profile staging]\nregion = eu-west-1\n"), 0o644); err != nil {
		t.Fatalf("write config: %v", err)
	}
	e := NewEngine(tofu.NewRunner("tofu"), config.Settings{AWSConfigPath: configPath}, recipes.Bundled())

	if err := e.Preflight(context.Background(), &Deployment{ProviderID: "aws", ProfileID: "staging"}); err != nil {
		t.Fatalf("expected the [profile staging] header to be recognised, got %v", err)
	}
}

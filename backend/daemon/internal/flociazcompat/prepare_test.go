// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package flociazcompat

import (
	"context"
	"crypto/rand"
	"crypto/rsa"
	"crypto/tls"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/pem"
	"math/big"
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestPrepareOpenTofuRuntimeValidatesFullContract(t *testing.T) {
	certPEM, tlsConfig := localhostTestCert(t)
	metadata := `{"resourceManager":"http://127.0.0.1:0"}`

	httpServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/":
			w.WriteHeader(http.StatusOK)
		case "/metadata/endpoints":
			_, _ = w.Write([]byte(metadata))
		case tlsCertPath:
			_, _ = w.Write(certPEM)
		default:
			w.WriteHeader(http.StatusNotFound)
		}
	}))
	defer httpServer.Close()

	tlsServer := httptest.NewUnstartedServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/metadata/endpoints" {
			_, _ = w.Write([]byte(metadata))
			return
		}
		w.WriteHeader(http.StatusNotFound)
	}))
	tlsServer.TLS = tlsConfig
	tlsServer.StartTLS()
	defer tlsServer.Close()

	hostPort := tlsServer.Listener.Addr().String()
	runtime, err := PrepareOpenTofuRuntime(context.Background(), httpServer.URL, t.TempDir())
	if err == nil {
		t.Fatalf("expected HTTPS metadata failure when metadata host does not match TLS listener, got %+v", runtime)
	}
	if !strings.Contains(err.Error(), "HTTPS") {
		t.Fatalf("expected HTTPS metadata error, got %v", err)
	}

	// Wire HTTP metadata + cert export to the TLS listener address the probe will use.
	httpServer.Config.Handler = http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/":
			w.WriteHeader(http.StatusOK)
		case "/metadata/endpoints":
			_, _ = w.Write([]byte(`{"resourceManager":"https://` + hostPort + `"}`))
		case tlsCertPath:
			_, _ = w.Write(certPEM)
		default:
			w.WriteHeader(http.StatusNotFound)
		}
	})

	// Override probeHTTPSMetadata target by pointing endpoint at TLS server for metadata host.
	trustDir := t.TempDir()
	base := normaliseEndpoint(httpServer.URL)
	if _, err := installTrustCertificate(context.Background(), base, trustDir); err != nil {
		t.Fatalf("installTrustCertificate: %v", err)
	}
	certPath := TrustCertPath(trustDir)
	if err := probeHTTPSMetadata(context.Background(), hostPort, certPath); err != nil {
		t.Fatalf("probeHTTPSMetadata: %v", err)
	}
}

func TestProviderOverrideAndTofuEnvironment(t *testing.T) {
	runtime := PreparedRuntime{
		MetadataHost:  "localhost:4577",
		TrustCertPath: "/tmp/floci-az-ca.pem",
	}
	override := ProviderOverrideHCL(runtime.MetadataHost)
	for _, want := range []string{ClientID, TenantID, "metadata_host", "resource_provider_registrations"} {
		if !strings.Contains(override, want) {
			t.Fatalf("override missing %q:\n%s", want, override)
		}
	}
	env := TofuEnvironment(runtime, nil)
	if !strings.Contains(strings.Join(env, "\n"), "SSL_CERT_FILE=/tmp/floci-az-ca.pem") {
		t.Fatalf("expected SSL_CERT_FILE in env, got %v", env)
	}
}

func localhostTestCert(t *testing.T) ([]byte, *tls.Config) {
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
	certPEM := pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: der})
	pool := x509.NewCertPool()
	pool.AppendCertsFromPEM(certPEM)
	return certPEM, &tls.Config{Certificates: []tls.Certificate{{Certificate: [][]byte{der}, PrivateKey: key}}, MinVersion: tls.VersionTLS12}
}


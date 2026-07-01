// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package flociazcompat

import (
	"context"
	"crypto/tls"
	"crypto/x509"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// PreparedRuntime is the validated floci-az state required for OpenTofu/azurerm.
type PreparedRuntime struct {
	Endpoint      string
	MetadataHost  string
	TrustCertPath string
}

// PrepareOpenTofuRuntime validates and materialises everything azurerm needs
// against floci-az: reachability, HTTP metadata, TLS certificate trust, and a
// successful HTTPS metadata probe (the same path azurerm 4.x uses).
func PrepareOpenTofuRuntime(ctx context.Context, endpoint string, trustDir string) (PreparedRuntime, error) {
	base := normaliseEndpoint(endpoint)
	metadataHost := MetadataHost(base)
	runtime := PreparedRuntime{Endpoint: base, MetadataHost: metadataHost}

	if err := probeReachable(ctx, base); err != nil {
		return PreparedRuntime{}, err
	}
	if err := probeHTTPMetadata(ctx, base); err != nil {
		return PreparedRuntime{}, err
	}

	certPath, err := installTrustCertificate(ctx, base, trustDir)
	if err != nil {
		return PreparedRuntime{}, err
	}
	runtime.TrustCertPath = certPath

	// On Windows the Go TLS stack ignores SSL_CERT_FILE and trusts only the
	// platform certificate store, so the on-disk PEM is not enough for the
	// OpenTofu azurerm provider; install the cert into the user Root store.
	if err := ensurePlatformTrust(ctx, certPath); err != nil {
		return PreparedRuntime{}, err
	}

	if err := probeHTTPSMetadata(ctx, metadataHost, certPath); err != nil {
		return PreparedRuntime{}, err
	}
	return runtime, nil
}

func normaliseEndpoint(endpoint string) string {
	endpoint = strings.TrimSpace(endpoint)
	if endpoint == "" {
		endpoint = DefaultEndpoint
	}
	return strings.TrimRight(endpoint, "/")
}

// MetadataHost strips the scheme for azurerm's metadata_host argument.
func MetadataHost(endpoint string) string {
	host := normaliseEndpoint(endpoint)
	host = strings.TrimPrefix(host, "https://")
	host = strings.TrimPrefix(host, "http://")
	return host
}

func probeReachable(ctx context.Context, base string) error {
	requestCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	request, err := http.NewRequestWithContext(requestCtx, http.MethodGet, base+"/", nil)
	if err != nil {
		return err
	}
	response, err := http.DefaultClient.Do(request)
	if err != nil {
		return fmt.Errorf("floci-az is not reachable at %s. Start it from Local Runtime, then try again", base)
	}
	defer response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode >= 500 {
		return fmt.Errorf("floci-az at %s is not ready (HTTP %d). Wait for it to finish starting, then try again", base, response.StatusCode)
	}
	return nil
}

func probeHTTPMetadata(ctx context.Context, base string) error {
	requestCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	url := fmt.Sprintf("%s/metadata/endpoints?api-version=%s", base, metadataAPIVersion)
	request, err := http.NewRequestWithContext(requestCtx, http.MethodGet, url, nil)
	if err != nil {
		return err
	}
	response, err := http.DefaultClient.Do(request)
	if err != nil {
		return fmt.Errorf("floci-az metadata endpoint is not available at %s: %w", url, err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return fmt.Errorf("floci-az metadata endpoint returned HTTP %d (expected 200). Pull floci/floci-az:latest and Recreate floci-az", response.StatusCode)
	}
	body, err := io.ReadAll(io.LimitReader(response.Body, 1<<20))
	if err != nil {
		return fmt.Errorf("read floci-az metadata: %w", err)
	}
	var decoded struct {
		ResourceManager string `json:"resourceManager"`
	}
	if err := json.Unmarshal(body, &decoded); err != nil {
		return fmt.Errorf("parse floci-az metadata: %w", err)
	}
	if strings.TrimSpace(decoded.ResourceManager) == "" {
		return fmt.Errorf("floci-az metadata response is missing resourceManager")
	}
	return nil
}

func installTrustCertificate(ctx context.Context, base, trustDir string) (string, error) {
	certPath := TrustCertPath(trustDir)
	if err := os.MkdirAll(filepath.Dir(certPath), 0o755); err != nil {
		return "", fmt.Errorf("create floci-az trust directory: %w", err)
	}

	requestCtx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()
	request, err := http.NewRequestWithContext(requestCtx, http.MethodGet, base+tlsCertPath, nil)
	if err != nil {
		return "", err
	}
	response, err := http.DefaultClient.Do(request)
	if err != nil {
		return "", fmt.Errorf(
			"floci-az TLS is not available (%s%s). Recreate floci-az from Local Runtime after pulling floci/floci-az:latest so CloudSprocket can apply the OpenTofu compatibility settings (FLOCI_AZ_TLS_ENABLED=true)",
			base, tlsCertPath,
		)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return "", fmt.Errorf(
			"floci-az TLS certificate endpoint returned HTTP %d. Recreate floci-az with TLS enabled (pull floci/floci-az:latest, then Recreate from Local Runtime)",
			response.StatusCode,
		)
	}
	data, err := io.ReadAll(io.LimitReader(response.Body, 1<<20))
	if err != nil {
		return "", fmt.Errorf("read floci-az TLS certificate: %w", err)
	}
	if !strings.Contains(string(data), "BEGIN CERTIFICATE") {
		return "", fmt.Errorf("floci-az TLS certificate endpoint did not return a PEM certificate")
	}
	if err := os.WriteFile(certPath, data, 0o644); err != nil {
		return "", fmt.Errorf("write floci-az trust certificate: %w", err)
	}
	return certPath, nil
}

func probeHTTPSMetadata(ctx context.Context, metadataHost, certPath string) error {
	pool, err := certPoolFromPEMFile(certPath)
	if err != nil {
		return err
	}
	client := &http.Client{
		Timeout: 10 * time.Second,
		Transport: &http.Transport{
			TLSClientConfig: &tls.Config{RootCAs: pool},
		},
	}
	requestCtx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()
	url := fmt.Sprintf("https://%s/metadata/endpoints?api-version=%s", metadataHost, metadataAPIVersion)
	request, err := http.NewRequestWithContext(requestCtx, http.MethodGet, url, nil)
	if err != nil {
		return err
	}
	response, err := client.Do(request)
	if err != nil {
		return fmt.Errorf(
			"azurerm cannot reach floci-az metadata over HTTPS at %s: %v. This usually means TLS is disabled on a stale floci-az container — pull floci/floci-az:latest and use Recreate floci-az from Local Runtime",
			url, err,
		)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return fmt.Errorf("floci-az HTTPS metadata returned HTTP %d (expected 200)", response.StatusCode)
	}
	return nil
}

func certPoolFromPEMFile(path string) (*x509.CertPool, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read trust certificate %s: %w", path, err)
	}
	pool := x509.NewCertPool()
	if !pool.AppendCertsFromPEM(data) {
		return nil, fmt.Errorf("parse trust certificate %s: no PEM certificates found", path)
	}
	return pool, nil
}

// TrustCertPath returns where the emulator CA is stored for OpenTofu.
func TrustCertPath(localConfigDir string) string {
	dir := strings.TrimSpace(localConfigDir)
	if dir == "" {
		dir = "."
	}
	path := filepath.Join(dir, "azure", TrustCertFilename)
	if abs, err := filepath.Abs(path); err == nil {
		return abs
	}
	return path
}
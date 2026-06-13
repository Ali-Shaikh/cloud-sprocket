package tofu

import (
	"archive/zip"
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"time"

	"cloudsprocket/backend/daemon/internal/config"
)

const (
	// DefaultVersion is the pinned OpenTofu release the app installs and runs.
	DefaultVersion = "1.12.2"

	defaultReleaseBaseURL = "https://github.com/opentofu/opentofu/releases/download"
)

// Installer downloads and verifies a pinned OpenTofu release into the tools dir.
type Installer struct {
	Version    string
	ToolsDir   string
	BaseURL    string
	HTTPClient *http.Client
}

// NewInstaller builds an installer for the pinned version under toolsDir.
func NewInstaller(toolsDir string) *Installer {
	return &Installer{
		Version:    DefaultVersion,
		ToolsDir:   toolsDir,
		BaseURL:    defaultReleaseBaseURL,
		HTTPClient: &http.Client{Timeout: 5 * time.Minute},
	}
}

// Resolve returns a usable tofu binary path without downloading. Order:
// explicit override, cached install of the pinned version, then PATH.
func Resolve(settings config.Settings) string {
	if path := strings.TrimSpace(settings.TofuPath); path != "" {
		return path
	}
	cached := installedBinaryPath(settings.ToolsDir, DefaultVersion)
	if fileExists(cached) {
		return cached
	}
	if path, err := exec.LookPath(binaryFileName()); err == nil {
		return path
	}
	return ""
}

// Ensure returns the path to a verified tofu binary, downloading and extracting
// the pinned release into the tools dir if it is not already present.
func (in *Installer) Ensure(ctx context.Context) (string, error) {
	target := installedBinaryPath(in.ToolsDir, in.Version)
	if fileExists(target) {
		return target, nil
	}

	asset := assetName(in.Version, runtime.GOOS, runtime.GOARCH)
	archive, err := in.download(ctx, in.assetURL(asset))
	if err != nil {
		return "", err
	}
	sums, err := in.download(ctx, in.assetURL(sumsName(in.Version)))
	if err != nil {
		return "", err
	}

	want, ok := checksumFor(string(sums), asset)
	if !ok {
		return "", fmt.Errorf("checksum for %s not found in SHA256SUMS", asset)
	}
	sum := sha256.Sum256(archive)
	if got := hex.EncodeToString(sum[:]); !strings.EqualFold(got, want) {
		return "", fmt.Errorf("checksum mismatch for %s: got %s want %s", asset, got, want)
	}

	if err := extractBinary(archive, target); err != nil {
		return "", err
	}
	return target, nil
}

func (in *Installer) assetURL(file string) string {
	return fmt.Sprintf("%s/v%s/%s", strings.TrimRight(in.BaseURL, "/"), in.Version, file)
}

func (in *Installer) download(ctx context.Context, url string) ([]byte, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	client := in.HTTPClient
	if client == nil {
		client = http.DefaultClient
	}
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("download %s: %w", url, err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("download %s: unexpected status %d", url, resp.StatusCode)
	}
	return io.ReadAll(resp.Body)
}

func assetName(version, goos, goarch string) string {
	return fmt.Sprintf("tofu_%s_%s_%s.zip", version, goos, goarch)
}

func sumsName(version string) string {
	return fmt.Sprintf("tofu_%s_SHA256SUMS", version)
}

func binaryFileName() string {
	if runtime.GOOS == "windows" {
		return "tofu.exe"
	}
	return "tofu"
}

func installedBinaryPath(toolsDir, version string) string {
	return filepath.Join(toolsDir, "opentofu", version, binaryFileName())
}

// checksumFor finds the hex checksum for a file in a SHA256SUMS document
// (lines of "<hex>  <filename>").
func checksumFor(sums, file string) (string, bool) {
	for _, line := range strings.Split(sums, "\n") {
		fields := strings.Fields(line)
		if len(fields) == 2 && fields[1] == file {
			return strings.ToLower(fields[0]), true
		}
	}
	return "", false
}

// extractBinary writes the tofu binary from a release zip to target.
func extractBinary(archive []byte, target string) error {
	reader, err := zip.NewReader(bytes.NewReader(archive), int64(len(archive)))
	if err != nil {
		return fmt.Errorf("open tofu archive: %w", err)
	}
	name := binaryFileName()
	for _, file := range reader.File {
		if filepath.Base(file.Name) != name {
			continue
		}
		source, err := file.Open()
		if err != nil {
			return err
		}
		defer source.Close()
		if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
			return err
		}
		out, err := os.OpenFile(target, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o755)
		if err != nil {
			return err
		}
		defer out.Close()
		if _, err := io.Copy(out, source); err != nil {
			return err
		}
		return nil
	}
	return fmt.Errorf("binary %q not found in tofu archive", name)
}

func fileExists(path string) bool {
	info, err := os.Stat(path)
	return err == nil && !info.IsDir()
}

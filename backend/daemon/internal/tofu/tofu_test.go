package tofu

import (
	"archive/zip"
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"runtime"
	"testing"

	"cloudsprocket/backend/daemon/internal/config"
)

func TestAssetAndSumsNames(t *testing.T) {
	if got := assetName("1.12.2", "windows", "amd64"); got != "tofu_1.12.2_windows_amd64.zip" {
		t.Fatalf("assetName = %q", got)
	}
	if got := sumsName("1.12.2"); got != "tofu_1.12.2_SHA256SUMS" {
		t.Fatalf("sumsName = %q", got)
	}
}

func TestAssetURL(t *testing.T) {
	in := &Installer{Version: "1.12.2", BaseURL: "https://example.test/dl/"}
	got := in.assetURL("tofu_1.12.2_linux_amd64.zip")
	want := "https://example.test/dl/v1.12.2/tofu_1.12.2_linux_amd64.zip"
	if got != want {
		t.Fatalf("assetURL = %q want %q", got, want)
	}
}

func TestChecksumFor(t *testing.T) {
	sums := "abc123  tofu_1.12.2_linux_amd64.zip\ndef456  tofu_1.12.2_windows_amd64.zip\n"
	got, ok := checksumFor(sums, "tofu_1.12.2_windows_amd64.zip")
	if !ok || got != "def456" {
		t.Fatalf("checksumFor = %q, %v", got, ok)
	}
	if _, ok := checksumFor(sums, "missing.zip"); ok {
		t.Fatal("expected missing file to be absent")
	}
}

// buildArchive returns a zip containing the tofu binary plus the matching
// SHA256SUMS content for this platform's asset.
func buildArchive(t *testing.T, binaryContent string) (archive []byte, sums string) {
	t.Helper()
	var buf bytes.Buffer
	zw := zip.NewWriter(&buf)
	// Include a decoy file to prove extraction selects by binary name.
	decoy, _ := zw.Create("LICENSE")
	_, _ = decoy.Write([]byte("license text"))
	entry, err := zw.Create(binaryFileName())
	if err != nil {
		t.Fatalf("zip create: %v", err)
	}
	if _, err := entry.Write([]byte(binaryContent)); err != nil {
		t.Fatalf("zip write: %v", err)
	}
	if err := zw.Close(); err != nil {
		t.Fatalf("zip close: %v", err)
	}
	archive = buf.Bytes()
	sum := sha256.Sum256(archive)
	sums = hex.EncodeToString(sum[:]) + "  " + assetName(DefaultVersion, runtime.GOOS, runtime.GOARCH) + "\n"
	return archive, sums
}

func newInstallerServer(t *testing.T, archive []byte, sums string) *Installer {
	t.Helper()
	mux := http.NewServeMux()
	asset := assetName(DefaultVersion, runtime.GOOS, runtime.GOARCH)
	mux.HandleFunc("/v"+DefaultVersion+"/"+asset, func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write(archive)
	})
	mux.HandleFunc("/v"+DefaultVersion+"/"+sumsName(DefaultVersion), func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(sums))
	})
	server := httptest.NewServer(mux)
	t.Cleanup(server.Close)
	return &Installer{
		Version:    DefaultVersion,
		ToolsDir:   t.TempDir(),
		BaseURL:    server.URL,
		HTTPClient: server.Client(),
	}
}

func TestEnsureDownloadsVerifiesExtracts(t *testing.T) {
	archive, sums := buildArchive(t, "fake-tofu-binary")
	in := newInstallerServer(t, archive, sums)

	path, err := in.Ensure(context.Background())
	if err != nil {
		t.Fatalf("Ensure: %v", err)
	}
	want := installedBinaryPath(in.ToolsDir, in.Version)
	if path != want {
		t.Fatalf("path = %q want %q", path, want)
	}
	content, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read extracted binary: %v", err)
	}
	if string(content) != "fake-tofu-binary" {
		t.Fatalf("extracted content = %q", string(content))
	}
}

func TestEnsureChecksumMismatch(t *testing.T) {
	archive, _ := buildArchive(t, "real-binary")
	tampered := "0000000000000000000000000000000000000000000000000000000000000000  " +
		assetName(DefaultVersion, runtime.GOOS, runtime.GOARCH) + "\n"
	in := newInstallerServer(t, archive, tampered)

	if _, err := in.Ensure(context.Background()); err == nil {
		t.Fatal("expected a checksum mismatch error")
	}
}

func TestEnsureUsesCachedBinary(t *testing.T) {
	in := &Installer{
		Version:  DefaultVersion,
		ToolsDir: t.TempDir(),
		BaseURL:  "http://127.0.0.1:0", // would fail if contacted
	}
	target := installedBinaryPath(in.ToolsDir, in.Version)
	if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(target, []byte("cached"), 0o755); err != nil {
		t.Fatal(err)
	}

	path, err := in.Ensure(context.Background())
	if err != nil {
		t.Fatalf("Ensure (cached): %v", err)
	}
	if path != target {
		t.Fatalf("path = %q want %q", path, target)
	}
}

func TestResolvePrefersExplicitPath(t *testing.T) {
	settings := config.Settings{TofuPath: "/custom/tofu", ToolsDir: t.TempDir()}
	if got := Resolve(settings); got != "/custom/tofu" {
		t.Fatalf("Resolve = %q", got)
	}
}

func TestResolveFindsCachedInstall(t *testing.T) {
	toolsDir := t.TempDir()
	target := installedBinaryPath(toolsDir, DefaultVersion)
	if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(target, []byte("x"), 0o755); err != nil {
		t.Fatal(err)
	}
	if got := Resolve(config.Settings{ToolsDir: toolsDir}); got != target {
		t.Fatalf("Resolve = %q want %q", got, target)
	}
}

func TestLineWriterSplitsLines(t *testing.T) {
	var lines []string
	w := &lineWriter{onLine: func(line string) { lines = append(lines, line) }}
	_, _ = w.Write([]byte("first line\r\nsecond "))
	_, _ = w.Write([]byte("line\npartial"))
	w.flush()

	want := []string{"first line", "second line", "partial"}
	if len(lines) != len(want) {
		t.Fatalf("lines = %#v", lines)
	}
	for i := range want {
		if lines[i] != want[i] {
			t.Fatalf("line %d = %q want %q", i, lines[i], want[i])
		}
	}
	if w.captured.String() != "first line\r\nsecond line\npartial" {
		t.Fatalf("captured = %q", w.captured.String())
	}
}

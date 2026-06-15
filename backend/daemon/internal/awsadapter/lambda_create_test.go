package awsadapter

import (
	"archive/zip"
	"bytes"
	"testing"
)

func TestStarterFunctionZipNodeJS(t *testing.T) {
	zipBytes, handler, err := starterFunctionZip("nodejs20.x", "")
	if err != nil {
		t.Fatalf("starterFunctionZip() error = %v", err)
	}
	if handler != "index.handler" {
		t.Fatalf("handler = %q", handler)
	}
	reader, err := zip.NewReader(bytes.NewReader(zipBytes), int64(len(zipBytes)))
	if err != nil {
		t.Fatalf("zip.NewReader() error = %v", err)
	}
	if len(reader.File) != 1 || reader.File[0].Name != "index.js" {
		t.Fatalf("zip entries = %+v", reader.File)
	}
}

func TestStarterFunctionZipPython(t *testing.T) {
	zipBytes, handler, err := starterFunctionZip("python3.12", "")
	if err != nil {
		t.Fatalf("starterFunctionZip() error = %v", err)
	}
	if handler != "lambda_function.handler" {
		t.Fatalf("handler = %q", handler)
	}
	reader, err := zip.NewReader(bytes.NewReader(zipBytes), int64(len(zipBytes)))
	if err != nil {
		t.Fatalf("zip.NewReader() error = %v", err)
	}
	if len(reader.File) != 1 || reader.File[0].Name != "lambda_function.py" {
		t.Fatalf("zip entries = %+v", reader.File)
	}
}

func TestStarterFunctionZipUnsupportedRuntime(t *testing.T) {
	_, _, err := starterFunctionZip("ruby3.2", "")
	if err == nil {
		t.Fatal("expected error for unsupported runtime")
	}
}
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package awsadapter

import (
	"archive/zip"
	"bytes"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"cloudsprocket/backend/daemon/internal/models"
)

const maxLambdaZipBytes = 50 * 1024 * 1024

func defaultHandlerForRuntime(runtime string) string {
	if strings.HasPrefix(runtime, "python") {
		return "lambda_function.handler"
	}
	return "index.handler"
}

func starterFunctionZip(runtime string, handler string) ([]byte, string, error) {
	handler = strings.TrimSpace(handler)
	if handler == "" {
		handler = defaultHandlerForRuntime(runtime)
	}

	var filename string
	var source string
	switch {
	case strings.HasPrefix(runtime, "nodejs"):
		filename = "index.js"
		source = `exports.handler = async (event) => {
  return {
    statusCode: 200,
    body: JSON.stringify({ ok: true, message: "Hello from CloudSprocket" }),
  };
};
`
	case strings.HasPrefix(runtime, "python"):
		filename = "lambda_function.py"
		source = `def handler(event, context):
    return {
        "statusCode": 200,
        "body": "Hello from CloudSprocket",
    }
`
	default:
		return nil, "", fmt.Errorf("runtime %q is not supported for starter function create", runtime)
	}

	buf := &bytes.Buffer{}
	writer := zip.NewWriter(buf)
	entry, err := writer.Create(filename)
	if err != nil {
		return nil, "", err
	}
	if _, err := entry.Write([]byte(source)); err != nil {
		return nil, "", err
	}
	if err := writer.Close(); err != nil {
		return nil, "", err
	}
	return buf.Bytes(), handler, nil
}

func customSourceZip(runtime string, source string, handler string) ([]byte, string, error) {
	handler = strings.TrimSpace(handler)
	if handler == "" {
		handler = defaultHandlerForRuntime(runtime)
	}
	filename := "index.js"
	if strings.HasPrefix(runtime, "python") {
		filename = "lambda_function.py"
	} else if !strings.HasPrefix(runtime, "nodejs") {
		return nil, "", fmt.Errorf("runtime %q is not supported for inline handler create", runtime)
	}

	buf := &bytes.Buffer{}
	writer := zip.NewWriter(buf)
	entry, err := writer.Create(filename)
	if err != nil {
		return nil, "", err
	}
	if _, err := entry.Write([]byte(source)); err != nil {
		return nil, "", err
	}
	if err := writer.Close(); err != nil {
		return nil, "", err
	}
	return buf.Bytes(), handler, nil
}

func readLambdaZipSource(path string) ([]byte, error) {
	cleaned := filepath.Clean(strings.TrimSpace(path))
	if cleaned == "" {
		return nil, fmt.Errorf("zip source path is required")
	}
	info, err := os.Stat(cleaned)
	if err != nil {
		return nil, err
	}
	if info.IsDir() {
		return nil, fmt.Errorf("zip source must be a file")
	}
	if info.Size() > maxLambdaZipBytes {
		return nil, fmt.Errorf("zip file must be %d bytes or smaller", maxLambdaZipBytes)
	}
	data, err := os.ReadFile(cleaned)
	if err != nil {
		return nil, err
	}
	if len(data) < 4 || data[0] != 'P' || data[1] != 'K' {
		return nil, fmt.Errorf("zip source must be a valid zip archive")
	}
	if _, err := zip.NewReader(bytes.NewReader(data), int64(len(data))); err != nil {
		return nil, fmt.Errorf("zip source must be a valid zip archive")
	}
	return data, nil
}

func functionZipFromCreateInput(input models.AwsLambdaCreateInput) ([]byte, string, error) {
	zipPath := strings.TrimSpace(input.ZipSourcePath)
	handlerSource := strings.TrimSpace(input.HandlerSource)
	if zipPath != "" && handlerSource != "" {
		return nil, "", fmt.Errorf("provide either inline handler source or a zip file, not both")
	}
	if zipPath != "" {
		zipBytes, err := readLambdaZipSource(zipPath)
		if err != nil {
			return nil, "", err
		}
		handler := strings.TrimSpace(input.Handler)
		if handler == "" {
			return nil, "", fmt.Errorf("handler is required when using a zip file")
		}
		return zipBytes, handler, nil
	}
	if handlerSource != "" {
		return customSourceZip(input.Runtime, handlerSource, input.Handler)
	}
	return starterFunctionZip(input.Runtime, input.Handler)
}
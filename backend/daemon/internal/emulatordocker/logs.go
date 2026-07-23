// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package emulatordocker

import (
	"bytes"
	"io"
	"strings"

	"github.com/moby/moby/api/pkg/stdcopy"
	"github.com/moby/moby/client"
)

// ClampLogTail bounds a requested log line count to a sensible default range.
// Non-positive values become 200; values above 1000 are capped at 1000.
func ClampLogTail(tail int) int {
	if tail <= 0 {
		return 200
	}
	if tail > 1000 {
		return 1000
	}
	return tail
}

// ReadContainerLogs decodes a Docker container log stream. It prefers demuxed
// stdout/stderr when the stream uses the Docker multiplexed format, and falls
// back to the raw payload otherwise.
func ReadContainerLogs(result client.ContainerLogsResult) (string, error) {
	raw, err := io.ReadAll(result)
	if err != nil {
		return "", err
	}
	var stdout bytes.Buffer
	var stderr bytes.Buffer
	if _, err := stdcopy.StdCopy(&stdout, &stderr, bytes.NewReader(raw)); err == nil {
		if stderr.Len() == 0 {
			return stdout.String(), nil
		}
		if stdout.Len() == 0 {
			return stderr.String(), nil
		}
		return stdout.String() + stderr.String(), nil
	}
	return string(raw), nil
}

// SplitLogLines normalises line endings and splits container log text into lines.
// An empty or whitespace-only payload yields an empty (non-nil) slice.
func SplitLogLines(text string) []string {
	text = strings.ReplaceAll(text, "\r\n", "\n")
	text = strings.TrimSpace(text)
	if text == "" {
		return []string{}
	}
	lines := strings.Split(text, "\n")
	for index := range lines {
		lines[index] = strings.TrimRight(lines[index], "\r")
	}
	return lines
}

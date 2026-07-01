// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

// Package tofu locates, installs, and runs the OpenTofu CLI on behalf of the
// daemon. It backs the IaC "recipe" deployment feature: a pinned OpenTofu
// binary is resolved (explicit path, cached download, or PATH) and invoked for
// init/plan/apply/destroy with output streamed line by line.
package tofu

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"strings"

	"cloudsprocket/backend/daemon/internal/sysproc"
)

// Runner executes the OpenTofu CLI from a resolved binary path.
type Runner struct {
	binaryPath string
}

// NewRunner builds a runner for a known binary path.
func NewRunner(binaryPath string) *Runner {
	return &Runner{binaryPath: binaryPath}
}

// BinaryPath returns the resolved tofu binary path (empty if unresolved).
func (r *Runner) BinaryPath() string {
	return r.binaryPath
}

// Available reports whether a binary path has been resolved.
func (r *Runner) Available() bool {
	return strings.TrimSpace(r.binaryPath) != ""
}

// LogFunc receives each merged stdout/stderr line as a command runs.
type LogFunc func(line string)

// RunOptions configures a single tofu invocation.
type RunOptions struct {
	// Dir is the working directory for the command.
	Dir string
	// Env holds extra environment entries appended to the process environment.
	Env []string
	// Args are the tofu subcommand and flags (without the binary itself).
	Args []string
	// OnLine, when set, is called with each output line as it is produced.
	OnLine LogFunc
}

// Run executes tofu with the given options, returning the full merged output.
// The output is also streamed line by line to OnLine when provided.
func (r *Runner) Run(ctx context.Context, opts RunOptions) ([]byte, error) {
	if !r.Available() {
		return nil, fmt.Errorf("opentofu binary is not available")
	}
	cmd := exec.CommandContext(ctx, r.binaryPath, opts.Args...)
	cmd.Dir = opts.Dir
	cmd.Env = mergeEnv(os.Environ(), opts.Env)
	sysproc.Hide(cmd)

	writer := &lineWriter{onLine: opts.OnLine}
	cmd.Stdout = writer
	cmd.Stderr = writer

	err := cmd.Run()
	writer.flush()
	if err != nil {
		return writer.captured.Bytes(), fmt.Errorf("tofu %s: %w", strings.Join(opts.Args, " "), err)
	}
	return writer.captured.Bytes(), nil
}

// mergeEnv combines process and deployment environment variables. Deployment
// entries win on duplicate keys so emulator-specific ARM_* values are not
// shadowed by a developer shell configured for real Azure.
func mergeEnv(base, overlay []string) []string {
	merged := make(map[string]string, len(base)+len(overlay))
	order := make([]string, 0, len(base)+len(overlay))
	add := func(entries []string) {
		for _, entry := range entries {
			key, _, ok := strings.Cut(entry, "=")
			if !ok || strings.TrimSpace(key) == "" {
				continue
			}
			if _, exists := merged[key]; !exists {
				order = append(order, key)
			}
			merged[key] = entry
		}
	}
	add(base)
	add(overlay)
	out := make([]string, 0, len(order))
	for _, key := range order {
		out = append(out, merged[key])
	}
	return out
}

// Version returns the OpenTofu version string (e.g. "1.12.2").
func (r *Runner) Version(ctx context.Context) (string, error) {
	out, err := r.Run(ctx, RunOptions{Args: []string{"version", "-json"}})
	if err != nil {
		return "", err
	}
	var decoded struct {
		Version          string `json:"terraform_version"`
		OpenTofuVersion  string `json:"tofu_version"`
	}
	if jsonErr := json.Unmarshal(out, &decoded); jsonErr == nil {
		if decoded.OpenTofuVersion != "" {
			return decoded.OpenTofuVersion, nil
		}
		if decoded.Version != "" {
			return decoded.Version, nil
		}
	}
	return strings.TrimSpace(string(out)), nil
}

// lineWriter captures the full output while emitting complete lines to onLine.
type lineWriter struct {
	captured bytes.Buffer
	partial  bytes.Buffer
	onLine   LogFunc
}

func (w *lineWriter) Write(p []byte) (int, error) {
	w.captured.Write(p)
	if w.onLine != nil {
		w.partial.Write(p)
		for {
			data := w.partial.Bytes()
			index := bytes.IndexByte(data, '\n')
			if index < 0 {
				break
			}
			w.onLine(strings.TrimRight(string(data[:index]), "\r"))
			w.partial.Next(index + 1)
		}
	}
	return len(p), nil
}

func (w *lineWriter) flush() {
	if w.onLine != nil && w.partial.Len() > 0 {
		w.onLine(strings.TrimRight(w.partial.String(), "\r"))
		w.partial.Reset()
	}
}

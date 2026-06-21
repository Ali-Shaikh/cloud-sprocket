//go:build windows

// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package sysproc

import (
	"path/filepath"
	"strings"
)

// BuildWindowsCmdLine returns a command suitable for pasting into cmd.exe.
func BuildWindowsCmdLine(command string, args ...string) string {
	ext := strings.ToLower(filepath.Ext(command))
	parts := make([]string, 0, len(args)+2)
	if ext == ".cmd" || ext == ".bat" {
		parts = append(parts, "call")
	}
	parts = append(parts, QuoteWindowsArg(command))
	for _, arg := range args {
		parts = append(parts, QuoteWindowsArg(arg))
	}
	return strings.Join(parts, " ")
}

// BuildWindowsPowerShellLine returns a command suitable for pasting into PowerShell.
func BuildWindowsPowerShellLine(command string, args ...string) string {
	parts := make([]string, 0, len(args)+1)
	parts = append(parts, "& "+QuotePowerShellArg(command))
	for _, arg := range args {
		parts = append(parts, QuotePowerShellArg(arg))
	}
	return strings.Join(parts, " ")
}

// QuoteWindowsArg quotes a token for cmd.exe when it contains spaces or /switch-like text.
func QuoteWindowsArg(value string) string {
	if value == "" {
		return `""`
	}
	if !needsWindowsQuoting(value) {
		return value
	}
	return `"` + strings.ReplaceAll(value, `"`, `""`) + `"`
}

func QuotePowerShellArg(value string) string {
	if value == "" {
		return "''"
	}
	if !strings.Contains(value, "'") {
		return "'" + value + "'"
	}
	escaped := strings.ReplaceAll(value, "`", "``")
	escaped = strings.ReplaceAll(escaped, "$", "`$")
	escaped = strings.ReplaceAll(escaped, `"`, "`\"")
	return `"` + escaped + `"`
}

func needsWindowsQuoting(value string) bool {
	if strings.ContainsAny(value, " \t\"") {
		return true
	}
	// Azure resource IDs (/subscriptions/...) are treated as cmd switches unless quoted.
	if strings.ContainsAny(value, "/&|<>^%") {
		return true
	}
	return false
}
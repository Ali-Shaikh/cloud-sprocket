// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package tofu

import (
	"context"
	"errors"
	"fmt"
	"strings"
)

// FormatRunError turns a tofu process failure into a user-facing message.
// OpenTofu often exits with opaque errors (context deadline exceeded, killed
// process) while the useful detail is in the last log lines, especially during
// provider installs such as hashicorp/azurerm.
func FormatRunError(ctx context.Context, args []string, output []byte, err error) error {
	if err == nil {
		return nil
	}
	op := strings.TrimSpace(strings.Join(args, " "))
	if op == "" {
		op = "command"
	}
	tail := strings.TrimSpace(tailOutput(output, 1800))
	lowerTail := strings.ToLower(tail)
	installingProviders := strings.Contains(lowerTail, "installing ") ||
		(strings.Contains(lowerTail, "finding ") && strings.Contains(lowerTail, "versions matching")) ||
		strings.Contains(lowerTail, "provider plugins")

	var message string
	switch {
	case ctx != nil && errors.Is(ctx.Err(), context.DeadlineExceeded):
		if installingProviders || strings.Contains(lowerTail, "azurerm") || strings.Contains(lowerTail, "hashicorp/") {
			message = fmt.Sprintf(
				"OpenTofu %s timed out while downloading providers. Large providers such as azurerm can be over 200 MB. Ensure this machine can reach registry.opentofu.org and GitHub, then retry. Successful downloads are stored in the app plugin cache and reused.",
				op,
			)
		} else {
			message = fmt.Sprintf(
				"OpenTofu %s timed out with no completion. Check the deployment log for the last progress line, verify network access, and retry.",
				op,
			)
		}
	case ctx != nil && errors.Is(ctx.Err(), context.Canceled):
		message = fmt.Sprintf("OpenTofu %s was cancelled.", op)
	case installingProviders:
		message = fmt.Sprintf(
			"OpenTofu %s failed while installing providers: %v. Check network access to the OpenTofu registry and GitHub, then retry.",
			op,
			err,
		)
	default:
		message = fmt.Sprintf("OpenTofu %s failed: %v", op, err)
	}

	if tail != "" {
		return fmt.Errorf("%s\n\nLast OpenTofu output:\n%s", message, tail)
	}
	return errors.New(message)
}

func tailOutput(output []byte, maxBytes int) string {
	if len(output) == 0 {
		return ""
	}
	if maxBytes <= 0 || len(output) <= maxBytes {
		return string(output)
	}
	// Prefer complete lines near the end.
	snippet := output[len(output)-maxBytes:]
	if index := strings.IndexByte(string(snippet), '\n'); index >= 0 && index+1 < len(snippet) {
		snippet = snippet[index+1:]
	}
	return string(snippet)
}

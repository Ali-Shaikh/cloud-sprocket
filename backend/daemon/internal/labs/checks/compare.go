// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package checks

import (
	"fmt"
	"strings"
)

func compareInt64(actual, expected int64, compare string) bool {
	switch strings.TrimSpace(compare) {
	case "eq":
		return actual == expected
	case "gte":
		return actual >= expected
	case "lte":
		return actual <= expected
	case "gt":
		return actual > expected
	case "lt":
		return actual < expected
	default:
		return false
	}
}

func attributeAsString(item map[string]any, name string) (string, bool) {
	if item == nil {
		return "", false
	}
	raw, ok := item[name]
	if !ok || raw == nil {
		return "", false
	}
	switch typed := raw.(type) {
	case string:
		return typed, true
	case float64:
		return strings.TrimRight(strings.TrimRight(fmt.Sprintf("%f", typed), "0"), "."), true
	case bool:
		if typed {
			return "true", true
		}
		return "false", true
	default:
		return fmt.Sprint(typed), true
	}
}

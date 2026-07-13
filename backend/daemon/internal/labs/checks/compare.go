// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package checks

import (
	"fmt"
	"strings"
)

// KnownCompareOps are the integer comparison operators accepted by lab
// verify types that use compare/value (sqs, sns, azure.queue-depth).
var KnownCompareOps = map[string]struct{}{
	"eq":  {},
	"gte": {},
	"lte": {},
	"gt":  {},
	"lt":  {},
}

// compareInt64 compares actual against expected using a closed operator set.
// Unknown operators return an error so callers do not misreport a config bug
// as a failed runtime check.
func compareInt64(actual, expected int64, compare string) (bool, error) {
	op := strings.TrimSpace(compare)
	switch op {
	case "eq":
		return actual == expected, nil
	case "gte":
		return actual >= expected, nil
	case "lte":
		return actual <= expected, nil
	case "gt":
		return actual > expected, nil
	case "lt":
		return actual < expected, nil
	default:
		return false, fmt.Errorf("unknown compare operator %q (want eq, gte, lte, gt, or lt)", compare)
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

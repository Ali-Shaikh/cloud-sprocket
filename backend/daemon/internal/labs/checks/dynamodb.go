// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package checks

import (
	"context"
	"fmt"
	"strings"

	"cloudsprocket/backend/daemon/internal/labs"
	"cloudsprocket/backend/daemon/internal/models"
	"cloudsprocket/backend/daemon/internal/recipes"
)

// DynamoDeps supplies item reads for DynamoDB verification checks.
type DynamoDeps struct {
	GetItem func(ctx context.Context, profile models.ProfileSummary, region, table, keyJSON string) (map[string]any, bool, error)
}

// DynamoDBItemCheck verifies an item is present and optionally an attribute equals a value.
type DynamoDBItemCheck struct {
	Deps DynamoDeps
}

func (c *DynamoDBItemCheck) Type() string {
	return recipes.LabVerifyDynamoDBItem
}

func (c *DynamoDBItemCheck) Run(
	ctx context.Context,
	verify recipes.LabVerify,
	checkCtx labs.CheckContext,
) (labs.VerifyResult, error) {
	result := labs.VerifyResult{Type: c.Type()}
	table := strings.TrimSpace(labs.ResolveTemplate(verify.Table, checkCtx.Deployment))
	keyJSON := strings.TrimSpace(labs.ResolveTemplate(verify.KeyJSON, checkCtx.Deployment))
	attribute := strings.TrimSpace(verify.Attribute)
	expected := labs.ResolveTemplate(verify.Value, checkCtx.Deployment)
	if table == "" || keyJSON == "" {
		result.Passed = false
		result.Message = "Table and keyJson are required for this verification."
		return result, nil
	}
	if c.Deps.GetItem == nil {
		return result, fmt.Errorf("DynamoDB get dependency is not configured")
	}

	item, found, err := c.Deps.GetItem(ctx, checkCtx.Profile, checkCtx.Region, table, keyJSON)
	if err != nil {
		result.Passed = false
		result.Message = "Could not read the DynamoDB item."
		result.Detail = err.Error()
		return result, nil
	}
	if !found {
		result.Passed = false
		result.Message = "Item was not found."
		result.Detail = fmt.Sprintf("table=%s key=%s", table, keyJSON)
		return result, nil
	}
	if attribute == "" {
		result.Passed = true
		result.Message = "Item exists."
		result.Detail = fmt.Sprintf("table=%s", table)
		return result, nil
	}
	actual, ok := attributeAsString(item, attribute)
	if !ok {
		result.Passed = false
		result.Message = fmt.Sprintf("Attribute %q is missing on the item.", attribute)
		return result, nil
	}
	if actual == expected {
		result.Passed = true
		result.Message = "Item attribute matches the expected value."
		result.Detail = fmt.Sprintf("%s=%q", attribute, actual)
		return result, nil
	}
	result.Passed = false
	result.Message = "Item attribute does not match the expected value."
	result.Detail = fmt.Sprintf("%s=%q (expected %q)", attribute, actual, expected)
	return result, nil
}

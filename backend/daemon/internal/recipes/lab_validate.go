// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package recipes

import (
	"fmt"
	"regexp"
	"strings"
)

const (
	LabDifficultyBeginner     = "beginner"
	LabDifficultyIntermediate = "intermediate"
	LabDifficultyAdvanced     = "advanced"

	LabActionOpenTab     = "open-tab"
	LabActionInvokeWrite = "invoke-write"

	LabVerifySQSQueueAttribute = "sqs.queue-attribute"
	LabVerifyHTTPGet           = "http.get"
)

var (
	labOutputRefPattern = regexp.MustCompile(`\{\{\s*outputs\.([a-zA-Z0-9_]+)\s*\}\}`)

	knownLabDifficulties = map[string]struct{}{
		LabDifficultyBeginner:     {},
		LabDifficultyIntermediate: {},
		LabDifficultyAdvanced:     {},
	}
	knownLabActionTypes = map[string]struct{}{
		LabActionOpenTab:     {},
		LabActionInvokeWrite: {},
	}
	knownLabVerifyTypes = map[string]struct{}{
		LabVerifySQSQueueAttribute: {},
		LabVerifyHTTPGet:           {},
	}
)

// ValidateLabSpec checks an optional lab section on a manifest.
func ValidateLabSpec(manifest Manifest) error {
	if manifest.Lab == nil {
		return nil
	}
	lab := manifest.Lab
	if difficulty := strings.TrimSpace(lab.Difficulty); difficulty != "" {
		if _, ok := knownLabDifficulties[difficulty]; !ok {
			return fmt.Errorf("recipe %q lab difficulty %q is not recognised", manifest.ID, difficulty)
		}
	}
	if lab.EstimatedMinutes < 0 {
		return fmt.Errorf("recipe %q lab estimatedMinutes must not be negative", manifest.ID)
	}

	outputNames := map[string]struct{}{}
	for _, hint := range manifest.Outputs {
		name := strings.TrimSpace(hint.Name)
		if name != "" {
			outputNames[name] = struct{}{}
		}
	}

	seenStepIDs := map[string]struct{}{}
	for index, step := range lab.Steps {
		stepID := strings.TrimSpace(step.ID)
		if stepID == "" {
			return fmt.Errorf("recipe %q lab step %d is missing id", manifest.ID, index)
		}
		if _, exists := seenStepIDs[stepID]; exists {
			return fmt.Errorf("recipe %q lab step id %q is duplicated", manifest.ID, stepID)
		}
		seenStepIDs[stepID] = struct{}{}
		if strings.TrimSpace(step.Title) == "" {
			return fmt.Errorf("recipe %q lab step %q is missing title", manifest.ID, stepID)
		}

		for actionIndex, action := range step.Actions {
			actionType := strings.TrimSpace(action.Type)
			if actionType == "" {
				return fmt.Errorf("recipe %q lab step %q action %d is missing type", manifest.ID, stepID, actionIndex)
			}
			if _, ok := knownLabActionTypes[actionType]; !ok {
				return fmt.Errorf("recipe %q lab step %q action %d type %q is not recognised", manifest.ID, stepID, actionIndex, actionType)
			}
			switch actionType {
			case LabActionOpenTab:
				if strings.TrimSpace(action.Tab) == "" {
					return fmt.Errorf("recipe %q lab step %q open-tab action is missing tab", manifest.ID, stepID)
				}
				if err := validateLabOutputRefs(manifest.ID, stepID, "focus", action.Focus, outputNames); err != nil {
					return err
				}
			case LabActionInvokeWrite:
				if strings.TrimSpace(action.Op) == "" {
					return fmt.Errorf("recipe %q lab step %q invoke-write action is missing op", manifest.ID, stepID)
				}
				for key, value := range action.Params {
					if err := validateLabOutputRefs(manifest.ID, stepID, "params."+key, value, outputNames); err != nil {
						return err
					}
				}
			}
		}

		for verifyIndex, verify := range step.Verify {
			verifyType := strings.TrimSpace(verify.Type)
			if verifyType == "" {
				return fmt.Errorf("recipe %q lab step %q verify %d is missing type", manifest.ID, stepID, verifyIndex)
			}
			if _, ok := knownLabVerifyTypes[verifyType]; !ok {
				return fmt.Errorf("recipe %q lab step %q verify %d type %q is not recognised", manifest.ID, stepID, verifyIndex, verifyType)
			}
			switch verifyType {
			case LabVerifySQSQueueAttribute:
				if err := validateLabOutputRefs(manifest.ID, stepID, "queue", verify.Queue, outputNames); err != nil {
					return err
				}
				if strings.TrimSpace(verify.Attribute) == "" {
					return fmt.Errorf("recipe %q lab step %q sqs.queue-attribute verify is missing attribute", manifest.ID, stepID)
				}
				if strings.TrimSpace(verify.Compare) == "" {
					return fmt.Errorf("recipe %q lab step %q sqs.queue-attribute verify is missing compare", manifest.ID, stepID)
				}
			case LabVerifyHTTPGet:
				if err := validateLabOutputRefs(manifest.ID, stepID, "url", verify.URL, outputNames); err != nil {
					return err
				}
			}
		}

		for hintIndex, hint := range step.Hints {
			if err := validateLabOutputRefs(manifest.ID, stepID, fmt.Sprintf("hints[%d]", hintIndex), hint, outputNames); err != nil {
				return err
			}
		}
		if err := validateLabOutputRefs(manifest.ID, stepID, "body", step.Body, outputNames); err != nil {
			return err
		}
	}

	return nil
}

func validateLabOutputRefs(recipeID, stepID, field, value string, outputNames map[string]struct{}) error {
	for _, name := range labOutputRefPattern.FindAllStringSubmatch(value, -1) {
		if len(name) < 2 {
			continue
		}
		ref := strings.TrimSpace(name[1])
		if ref == "" {
			continue
		}
		if _, ok := outputNames[ref]; !ok {
			return fmt.Errorf("recipe %q lab step %q %s references unknown output %q", recipeID, stepID, field, ref)
		}
	}
	return nil
}
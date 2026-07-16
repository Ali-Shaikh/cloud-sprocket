// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

// Package policy evaluates bundled CloudSprocket guardrails against an
// OpenTofu plan. Policies are embedded in the daemon and evaluated in-process.
package policy

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"sort"
	"strings"
	"time"
)

// Severity describes the intended enforcement level of a finding.
type Severity string

const (
	SeverityWarning Severity = "warning"
	SeverityDeny    Severity = "deny"
)

// Status summarises a complete policy evaluation.
type Status string

const (
	StatusPassed  Status = "passed"
	StatusWarned  Status = "warned"
	StatusBlocked Status = "blocked"
)

// Finding is one bundled policy result.
type Finding struct {
	RuleID          string   `json:"ruleId"`
	Title           string   `json:"title"`
	Message         string   `json:"message"`
	Severity        Severity `json:"severity"`
	ResourceAddress string   `json:"resourceAddress,omitempty"`
}

// Override records an explicit operator acknowledgement for one exact policy
// decision. It is invalidated when the plan or evaluated findings change.
type Override struct {
	DecisionDigest string   `json:"decisionDigest"`
	ConfirmedAt    string   `json:"confirmedAt"`
	FindingKeys    []string `json:"findingKeys"`
}

// Evaluation is persisted alongside the deployment plan summary.
type Evaluation struct {
	Status         Status    `json:"status"`
	PlanDigest     string    `json:"planDigest"`
	DecisionDigest string    `json:"decisionDigest"`
	EvaluatedAt    string    `json:"evaluatedAt"`
	BlockingCount  int       `json:"blockingCount"`
	Findings       []Finding `json:"findings"`
	Override       *Override `json:"override,omitempty"`
}

// Options provides target and configuration data that is not contained in the
// OpenTofu plan itself.
type Options struct {
	Local          bool
	PlanDigest     string
	RequiredTags   []string
	AllowedRegions []string
	EvaluatedAt    time.Time
}

// Evaluate parses an OpenTofu plan and returns deterministic bundled policy
// findings. OpenTofu JSON format major versions other than 1 are rejected.
func Evaluate(ctx context.Context, rawPlan []byte, options Options) (Evaluation, error) {
	if err := ctx.Err(); err != nil {
		return Evaluation{}, fmt.Errorf("evaluate bundled policy: %w", err)
	}
	var plan map[string]any
	if err := json.Unmarshal(rawPlan, &plan); err != nil {
		return Evaluation{}, fmt.Errorf("parse OpenTofu plan JSON for policy: %w", err)
	}
	if err := validateFormatVersion(plan); err != nil {
		return Evaluation{}, err
	}

	findings, err := evaluatePlan(ctx, plan, options)
	if err != nil {
		return Evaluation{}, err
	}
	sortFindings(findings)

	blocking := 0
	if !options.Local {
		for _, finding := range findings {
			if finding.Severity == SeverityDeny {
				blocking++
			}
		}
	}
	status := StatusPassed
	if len(findings) > 0 {
		status = StatusWarned
	}
	if blocking > 0 {
		status = StatusBlocked
	}
	evaluatedAt := options.EvaluatedAt
	if evaluatedAt.IsZero() {
		evaluatedAt = time.Now().UTC()
	}
	evaluation := Evaluation{
		Status:        status,
		PlanDigest:    strings.TrimSpace(options.PlanDigest),
		EvaluatedAt:   evaluatedAt.UTC().Format(time.RFC3339Nano),
		BlockingCount: blocking,
		Findings:      findings,
	}
	evaluation.DecisionDigest, err = decisionDigest(evaluation.PlanDigest, findings, options)
	if err != nil {
		return Evaluation{}, err
	}
	return evaluation, nil
}

func validateFormatVersion(plan map[string]any) error {
	value, _ := plan["format_version"].(string)
	value = strings.TrimSpace(value)
	if value == "" {
		return nil
	}
	major, _, _ := strings.Cut(value, ".")
	if major != "1" {
		return fmt.Errorf("unsupported OpenTofu plan JSON format_version %q; plan again with a supported OpenTofu release", value)
	}
	return nil
}

func sortedUnique(values []string) []string {
	seen := make(map[string]struct{}, len(values))
	result := make([]string, 0, len(values))
	for _, value := range values {
		value = strings.TrimSpace(value)
		if value == "" {
			continue
		}
		if _, ok := seen[value]; ok {
			continue
		}
		seen[value] = struct{}{}
		result = append(result, value)
	}
	sort.Strings(result)
	return result
}

func sortFindings(findings []Finding) {
	sort.Slice(findings, func(i, j int) bool {
		left, right := findings[i], findings[j]
		if left.Severity != right.Severity {
			return left.Severity == SeverityDeny
		}
		if left.RuleID != right.RuleID {
			return left.RuleID < right.RuleID
		}
		if left.ResourceAddress != right.ResourceAddress {
			return left.ResourceAddress < right.ResourceAddress
		}
		return left.Message < right.Message
	})
}

func decisionDigest(planDigest string, findings []Finding, options Options) (string, error) {
	payload := struct {
		PlanDigest     string    `json:"planDigest"`
		Findings       []Finding `json:"findings"`
		Local          bool      `json:"local"`
		RequiredTags   []string  `json:"requiredTags"`
		AllowedRegions []string  `json:"allowedRegions"`
	}{
		PlanDigest:     planDigest,
		Findings:       findings,
		Local:          options.Local,
		RequiredTags:   sortedUnique(options.RequiredTags),
		AllowedRegions: sortedUnique(options.AllowedRegions),
	}
	raw, err := json.Marshal(payload)
	if err != nil {
		return "", fmt.Errorf("encode policy decision digest: %w", err)
	}
	sum := sha256.Sum256(raw)
	return "sha256:" + hex.EncodeToString(sum[:]), nil
}

// OverridePhrase returns the exact acknowledgement required for a blocked live
// apply. The phrase is an acknowledgement, not an authentication mechanism.
func OverridePhrase(deploymentID string) string {
	return "APPLY " + strings.TrimSpace(deploymentID)
}

// HasValidOverride reports whether the stored override matches this exact
// evaluation decision.
func (e Evaluation) HasValidOverride() bool {
	return e.Override != nil &&
		strings.TrimSpace(e.Override.DecisionDigest) != "" &&
		e.Override.DecisionDigest == e.DecisionDigest
}

// AcceptOverride binds an operator acknowledgement to this exact decision.
func (e *Evaluation) AcceptOverride(at time.Time) {
	if e == nil || e.Status != StatusBlocked {
		return
	}
	if at.IsZero() {
		at = time.Now().UTC()
	}
	keys := make([]string, 0, e.BlockingCount)
	for _, finding := range e.Findings {
		if finding.Severity != SeverityDeny {
			continue
		}
		keys = append(keys, findingKey(finding))
	}
	e.Override = &Override{
		DecisionDigest: e.DecisionDigest,
		ConfirmedAt:    at.UTC().Format(time.RFC3339Nano),
		FindingKeys:    keys,
	}
}

func findingKey(finding Finding) string {
	if finding.ResourceAddress == "" {
		return finding.RuleID
	}
	return finding.RuleID + ":" + finding.ResourceAddress
}

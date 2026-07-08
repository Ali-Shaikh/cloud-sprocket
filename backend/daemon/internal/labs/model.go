// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

// Package labs runs guided, verifiable learning sessions bound to applied deployments.
package labs

// StepStatus is the progress state of one lab step.
type StepStatus string

const (
	StepStatusPending    StepStatus = "pending"
	StepStatusInProgress StepStatus = "in_progress"
	StepStatusCompleted  StepStatus = "completed"
	StepStatusFailed     StepStatus = "failed"
)

// VerifyResult is the outcome of one verification check.
type VerifyResult struct {
	Type    string `json:"type"`
	Passed  bool   `json:"passed"`
	Message string `json:"message,omitempty"`
	Detail  string `json:"detail,omitempty"`
}

// StepState tracks one lab step in a session.
type StepState struct {
	ID                  string         `json:"id"`
	Status              StepStatus     `json:"status"`
	StartedAt           string         `json:"startedAt,omitempty"`
	CompletedAt         string         `json:"completedAt,omitempty"`
	VerificationResults []VerifyResult `json:"verificationResults,omitempty"`
}

// LabSession is the persisted progress for a deployment lab run.
type LabSession struct {
	DeploymentID  string      `json:"deploymentId"`
	RecipeID      string      `json:"recipeId"`
	StartedAt     string      `json:"startedAt"`
	UpdatedAt     string      `json:"updatedAt"`
	CurrentStepID string      `json:"currentStepId,omitempty"`
	Steps         []StepState `json:"steps"`
	Completed     bool        `json:"completed"`
	CompletedAt   string      `json:"completedAt,omitempty"`
}

// OpenTabAction is the resolved payload for an open-tab lab action.
type OpenTabAction struct {
	Type  string `json:"type"`
	Tab   string `json:"tab"`
	Focus string `json:"focus,omitempty"`
}
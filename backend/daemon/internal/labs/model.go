// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

// Package labs runs guided, verifiable learning sessions bound to applied deployments.
package labs

// StepStatus is the progress state of one lab step.
type StepStatus string

const (
	StepStatusPending    StepStatus = "pending"
	StepStatusInProgress StepStatus = "in_progress"
	StepStatusPassed     StepStatus = "passed"
	StepStatusFailed     StepStatus = "failed"
)

// SessionStatus is the overall progress state of a lab session.
type SessionStatus string

const (
	SessionStatusInProgress SessionStatus = "in_progress"
	SessionStatusCompleted  SessionStatus = "completed"
)

// VerifyResult is the outcome of one verification check.
type VerifyResult struct {
	Type    string `json:"type"`
	Passed  bool   `json:"passed"`
	Detail  string `json:"detail,omitempty"`
	Message string `json:"message,omitempty"`
}

// StepState tracks one lab step in a session.
type StepState struct {
	StepID        string         `json:"stepId"`
	Status        StepStatus     `json:"status"`
	StartedAt     string         `json:"startedAt,omitempty"`
	CompletedAt   string         `json:"completedAt,omitempty"`
	VerifyResults []VerifyResult `json:"verifyResults"`
}

// LabSession is the persisted progress for a deployment lab run.
type LabSession struct {
	DeploymentID  string        `json:"deploymentId"`
	RecipeID      string        `json:"recipeId"`
	Status        SessionStatus `json:"status"`
	StartedAt     string        `json:"startedAt"`
	CompletedAt   string        `json:"completedAt,omitempty"`
	UpdatedAt     string        `json:"updatedAt,omitempty"`
	CurrentStepID string        `json:"currentStepId,omitempty"`
	Steps         []StepState   `json:"steps"`
}

// LabRunActionResult is returned by labs.runAction.
type LabRunActionResult struct {
	Session LabSession `json:"session"`
	Action  any        `json:"action,omitempty"`
}

// OpenTabAction is the resolved payload for an open-tab lab action.
type OpenTabAction struct {
	Type  string `json:"type"`
	Tab   string `json:"tab"`
	Focus string `json:"focus,omitempty"`
}
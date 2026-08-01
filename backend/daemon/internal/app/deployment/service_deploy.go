// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package deployment

import (
	"archive/zip"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"io/fs"
	"log"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"cloudsprocket/backend/daemon/internal/deploy"
	"cloudsprocket/backend/daemon/internal/models"
	"cloudsprocket/backend/daemon/internal/policy"
	"cloudsprocket/backend/daemon/internal/recipes"

	"gopkg.in/yaml.v3"
)

// deploymentPlanRequest is the payload for deployments.plan.
// UpdateDeploymentID, when supplied for an applied deployment, re-uses that
// record (re-seeding variables) and produces a fresh plan for re-apply (B2 update flow).
type deploymentPlanRequest struct {
	RecipeID           string         `json:"recipeId"`
	Name               string         `json:"name"`
	ProviderID         string         `json:"providerId"`
	ProfileID          string         `json:"profileId"`
	Local              bool           `json:"local"`
	RuntimeID          string         `json:"runtimeId,omitempty"`
	Variables          map[string]any `json:"variables"`
	UpdateDeploymentID string         `json:"updateDeploymentId,omitempty"`
}

// deploymentJob is returned by plan/apply/destroy: the deployment record plus
// the background job tracking the operation.
type DeploymentJob struct {
	Deployment *deploy.Deployment `json:"deployment"`
	Job        models.JobStatus   `json:"job"`
}

type deploymentDriftResult struct {
	Deployment *deploy.Deployment `json:"deployment"`
	Drift      deploy.DriftReport `json:"drift"`
}

// deploymentLogEvent is streamed per tofu output line.
type deploymentLogEvent struct {
	DeploymentID string `json:"deploymentId"`
	JobID        string `json:"jobId"`
	Line         string `json:"line"`
}

type TofuStatus struct {
	Available bool   `json:"available"`
	Version   string `json:"version"`
	Path      string `json:"path"`
}

type deploymentAction int

const (
	actionApply deploymentAction = iota
	actionDestroy
	actionRetryPostApply
)

func (s *Service) newJobID() string {
	return fmt.Sprintf("job-%d", s.now().UnixNano())
}

// targetLabel names a deployment's target for log lines via the deploy engine.
func (s *Service) targetLabel(deployment *deploy.Deployment) string {
	return s.deployer.TargetLabel(deployment)
}

// TofuStatus reports whether the OpenTofu engine is available.
func (s *Service) TofuStatus(ctx context.Context) TofuStatus {
	available := s.deployer.Available()
	version := ""
	if available {
		version, _ = s.deployer.Version(ctx)
	}
	return TofuStatus{Available: available, Version: version, Path: s.deployer.BinaryPath()}
}

func (s *Service) runTofuInstall(job models.JobStatus, notifier Notifier) {
	s.emitJobStatus(notifier, job, "running", "Downloading OpenTofu.")
	version, err := s.deployer.Install(context.Background())
	if err != nil {
		s.emitJobStatus(notifier, job, "failed", "Could not install OpenTofu: "+err.Error())
		return
	}
	s.emitJobStatus(notifier, job, "completed", "OpenTofu "+version+" is ready.")
}

// DeploymentsList returns all stored deployments with secrets opened.
func (s *Service) DeploymentsList(ctx context.Context) ([]deploy.Deployment, error) {
	rows, err := s.store.ListDeployments(ctx)
	if err != nil {
		return nil, err
	}
	deployments := make([]deploy.Deployment, 0, len(rows))
	for _, row := range rows {
		var deployment deploy.Deployment
		if err := json.Unmarshal(row.Payload, &deployment); err != nil {
			continue
		}
		if err := s.secrets.OpenFromStore(ctx, &deployment, string(row.Payload), row.UpdatedAt); err != nil {
			return nil, err
		}
		deployments = append(deployments, deployment)
	}
	return deployments, nil
}

// DeploymentGet loads a deployment by id with secrets opened.
func (s *Service) DeploymentGet(ctx context.Context, id string) (*deploy.Deployment, error) {
	raw, storedUpdatedAt, found, err := s.store.LoadDeploymentRaw(ctx, id)
	if err != nil {
		return nil, err
	}
	if !found {
		return nil, fmt.Errorf("deployment %s not found", id)
	}
	var deployment deploy.Deployment
	if err := json.Unmarshal([]byte(raw), &deployment); err != nil {
		return nil, err
	}
	if err := s.secrets.OpenFromStore(ctx, &deployment, raw, storedUpdatedAt); err != nil {
		return nil, err
	}
	return &deployment, nil
}

// deleteDeployment removes a deployment record and its on-disk workspace. It
// refuses to delete a deployment that is mid-operation (stop it first) or one
// with live infrastructure (destroy it first), so a record is never orphaned
// from resources it still owns.
func (s *Service) deleteDeployment(ctx context.Context, id string) error {
	deployment, err := s.DeploymentGet(ctx, id)
	if err != nil {
		return err
	}

	s.deployCancelsMu.Lock()
	hasActiveOperation := s.deployCancels[id] != nil
	s.deployCancelsMu.Unlock()

	if hasActiveOperation || deployment.Status == deploy.StatusPlanning || deployment.Status == deploy.StatusApplying || deployment.Status == deploy.StatusDestroying {
		return fmt.Errorf("this deployment is still running or stopping; wait for the current operation (or stop) to fully complete before removing it")
	}
	if deployment.Status == deploy.StatusApplied || (deployment.Status == deploy.StatusCancelled && len(deployment.Outputs) > 0) {
		return fmt.Errorf("this deployment still has (or had) live resources; destroy it before removing the record")
	}
	// Remove workspace first. If it fails (e.g. files still in use by a just-stopped operation),
	// we keep the record so user can retry or investigate. Guard above already prevents delete
	// while an operation (or its stop) is in flight.
	if err := s.deployer.RemoveWorkspace(id); err != nil {
		return err
	}
	if err := s.store.DeleteDeployment(ctx, id); err != nil {
		return err
	}
	return nil
}

func (s *Service) startDeploymentPlan(ctx context.Context, request deploymentPlanRequest, notifier Notifier) (DeploymentJob, error) {
	if strings.TrimSpace(request.RecipeID) == "" {
		return DeploymentJob{}, fmt.Errorf("recipeId is required")
	}
	recipe, err := s.recipes.Load(request.RecipeID)
	if err != nil {
		return DeploymentJob{}, err
	}

	name := strings.TrimSpace(request.Name)
	if name == "" {
		name = request.RecipeID
	}
	now := s.timestamp()

	var deployment *deploy.Deployment
	if request.UpdateDeploymentID != "" {
		// Update flow (B2): reuse existing deployment record for re-seed + re-plan against live state.
		existing, getErr := s.DeploymentGet(ctx, request.UpdateDeploymentID)
		if getErr != nil {
			return DeploymentJob{}, fmt.Errorf("update target deployment not found: %w", getErr)
		}
		if existing.Status != deploy.StatusApplied && existing.Status != deploy.StatusPlanned && existing.Status != deploy.StatusFailed {
			return DeploymentJob{}, fmt.Errorf("update is only supported for applied (or planned/failed) deployments")
		}
		// Snapshot prior state into revisions for history (values at time of update initiation).
		prior := deploy.DeploymentRevision{
			At:            now,
			RecipeVersion: existing.RecipeVersion,
			Variables:     cloneVariables(existing.Variables),
			Plan:          existing.Plan,
			Policy:        existing.Policy,
		}
		deployment = existing
		deployment.Variables = cloneVariables(request.Variables)
		deployment.Name = name
		deployment.ProviderID = request.ProviderID
		deployment.ProfileID = request.ProfileID
		deployment.Local = request.Local
		deployment.RuntimeID = request.RuntimeID
		deployment.SensitiveVars = sensitiveVariableNames(recipe)
		deployment.Plan = nil
		deployment.Policy = nil
		deployment.Error = ""
		deployment.Drift = nil
		deployment.Status = deploy.StatusPending
		deployment.UpdatedAt = now
		deployment.Revisions = append(append([]deploy.DeploymentRevision(nil), existing.Revisions...), prior)
		deployment.RecipeVersion = recipe.Manifest.Version
	} else {
		deployment = &deploy.Deployment{
			ID:            deploy.NewID(),
			RecipeID:      request.RecipeID,
			Name:          name,
			ProviderID:    request.ProviderID,
			ProfileID:     request.ProfileID,
			Local:         request.Local,
			RuntimeID:     request.RuntimeID,
			Variables:     request.Variables,
			SensitiveVars: sensitiveVariableNames(recipe),
			Status:        deploy.StatusPending,
			CreatedAt:     now,
			UpdatedAt:     now,
			RecipeVersion: recipe.Manifest.Version,
		}
	}
	deploy.NormaliseDeploymentTarget(deployment)
	if err := s.SaveDeployment(ctx, deployment, now); err != nil {
		return DeploymentJob{}, err
	}

	job := models.JobStatus{JobID: s.newJobID(), Label: "Plan " + name, Status: "queued", Message: "Planning deployment."}
	go s.runDeploymentPlan(deployment, job, notifier)
	return DeploymentJob{Deployment: deployment, Job: job}, nil
}

// cloneVariables deep-clones a variables map so revision snapshots stay isolated
// from later mutations of nested maps/slices.
func cloneVariables(src map[string]any) map[string]any {
	if src == nil {
		return nil
	}
	raw, err := json.Marshal(src)
	if err != nil {
		// Fall back to a shallow copy if a value is not JSON-serialisable.
		dst := make(map[string]any, len(src))
		for k, v := range src {
			dst[k] = v
		}
		return dst
	}
	var dst map[string]any
	if err := json.Unmarshal(raw, &dst); err != nil {
		dst = make(map[string]any, len(src))
		for k, v := range src {
			dst[k] = v
		}
	}
	return dst
}

// safeRecipePathSegment clamps a manifest id or version for use as a single path
// segment under ImportedRecipesDir. Rejects empty, traversal, and separator chars.
func SafeRecipePathSegment(value, field string) (string, error) {
	v := strings.TrimSpace(value)
	if v == "" {
		return "", fmt.Errorf("manifest %s is empty", field)
	}
	// Reject separators / traversal in the raw value before any Join.
	if strings.ContainsAny(v, `/\`) || strings.Contains(v, "..") {
		return "", fmt.Errorf("manifest %s %q is not a safe path segment", field, value)
	}
	base := filepath.Base(filepath.Clean(v))
	if base == "." || base == ".." || base != v {
		// base != v catches cleaned forms that still differ (e.g. trailing dots on some OSes).
		return "", fmt.Errorf("manifest %s %q is not a safe path segment", field, value)
	}
	return base, nil
}

// shouldSkipImportPath skips VCS and other hidden tooling dirs during recipe import.
func shouldSkipImportPath(rel string, _ fs.DirEntry) bool {
	return recipes.ShouldSkipImportRel(rel)
}

func (s *Service) startDeploymentAction(id string, action deploymentAction, policyOverride string, notifier Notifier) (DeploymentJob, error) {
	deployment, err := s.DeploymentGet(context.Background(), id)
	if err != nil {
		return DeploymentJob{}, err
	}
	if action == actionApply {
		if deployment.Status != deploy.StatusPlanned {
			return DeploymentJob{}, fmt.Errorf("apply requires a planned deployment")
		}
		if err := s.authorisePolicyApply(context.Background(), deployment, policyOverride, notifier); err != nil {
			return DeploymentJob{}, err
		}
	}
	label := "Apply " + deployment.Name
	if action == actionDestroy {
		label = "Destroy " + deployment.Name
	}
	job := models.JobStatus{JobID: s.newJobID(), Label: label, Status: "queued", Message: label + "."}
	go s.runDeploymentAction(deployment, action, job, notifier)
	return DeploymentJob{Deployment: deployment, Job: job}, nil
}

func (s *Service) authorisePolicyApply(ctx context.Context, deployment *deploy.Deployment, confirmation string, notifier Notifier) error {
	if deployment.Policy == nil {
		return fmt.Errorf("deployment has no policy evaluation; plan again before applying")
	}
	if deployment.Policy.Status != policy.StatusBlocked || deployment.Policy.HasValidOverride() {
		return nil
	}
	expected := policy.OverridePhrase(deployment.ID)
	if confirmation != expected {
		return fmt.Errorf("policy guardrails blocked apply; type %q to acknowledge %d blocking finding(s)", expected, deployment.Policy.BlockingCount)
	}

	previousOverride := deployment.Policy.Override
	previousUpdatedAt := deployment.UpdatedAt
	deployment.Policy.AcceptOverride(s.now())
	deployment.UpdatedAt = s.timestamp()
	rules := blockingPolicyRules(*deployment.Policy)
	message := fmt.Sprintf("Policy override accepted for deployment %s (%s). Blocking rules: %s.", deployment.Name, deployment.ID, strings.Join(rules, ", "))
	sealed, err := s.secrets.SealForStore(deployment)
	if err != nil {
		deployment.Policy.Override = previousOverride
		deployment.UpdatedAt = previousUpdatedAt
		return err
	}
	entry, err := s.store.SaveDeploymentWithLog(
		ctx,
		deployment.ID,
		sealed,
		deployment.UpdatedAt,
		"warning",
		message,
		"",
		s.timestamp(),
	)
	if err != nil {
		deployment.Policy.Override = previousOverride
		deployment.UpdatedAt = previousUpdatedAt
		return fmt.Errorf("persist policy override and activity: %w", err)
	}
	if notifier != nil {
		if err := notifier.Notify("log.appended", entry); err != nil {
			log.Printf("deployments: policy override activity notification failed for %s: %v", deployment.ID, err)
		}
		_ = notifier.Notify("deployment.changed", deployment)
	}
	return nil
}

func blockingPolicyRules(evaluation policy.Evaluation) []string {
	seen := map[string]struct{}{}
	rules := []string{}
	for _, finding := range evaluation.Findings {
		if finding.Severity != policy.SeverityDeny {
			continue
		}
		if _, ok := seen[finding.RuleID]; ok {
			continue
		}
		seen[finding.RuleID] = struct{}{}
		rules = append(rules, finding.RuleID)
	}
	sort.Strings(rules)
	return rules
}

// registerDeployCancel records the cancel func for an in-flight deployment run.
func (s *Service) registerDeployCancel(id string, cancel context.CancelFunc) {
	s.deployCancelsMu.Lock()
	defer s.deployCancelsMu.Unlock()
	if s.deployCancels == nil {
		s.deployCancels = map[string]context.CancelFunc{}
	}
	s.deployCancels[id] = cancel
}

// clearDeployCancel drops a deployment's cancel func once its run has finished.
func (s *Service) clearDeployCancel(id string) {
	s.deployCancelsMu.Lock()
	defer s.deployCancelsMu.Unlock()
	delete(s.deployCancels, id)
}

// cancelDeployment aborts the in-flight plan/apply/destroy for a deployment by
// cancelling its run context, which kills the underlying tofu process. On
// Windows the azurerm provider child often survives; ReleaseWorkspace stops it
// so Remove no longer fails with Access is denied.
//
// Status is forced to cancelled immediately and broadcast via deployment.changed.
// Previously cancel only signalled the run context; a hung docker compose
// preflight never returned, so the UI kept showing Stop/planning with no visible
// effect. Immediate status settle is what makes the button work.
func (s *Service) cancelDeployment(ctx context.Context, id string, notifier Notifier) error {
	s.deployCancelsMu.Lock()
	cancel := s.deployCancels[id]
	s.deployCancelsMu.Unlock()

	hadCancel := cancel != nil
	if cancel != nil {
		cancel()
	}
	// When preflight is stuck in `docker compose up`, context cancel alone is
	// not always enough on Windows: also stop the managed compose project.
	deploy.StopManagedDockerCompose()
	// Give tofu a moment to exit, then clear orphaned provider plugins.
	time.AfterFunc(400*time.Millisecond, func() {
		s.deployer.ReleaseWorkspace(id)
	})
	s.deployer.ReleaseWorkspace(id)

	deployment, err := s.DeploymentGet(ctx, id)
	if err != nil {
		if !hadCancel {
			return fmt.Errorf("no operation is currently running for this deployment")
		}
		return nil
	}
	switch deployment.Status {
	case deploy.StatusPending, deploy.StatusPlanning, deploy.StatusApplying, deploy.StatusDestroying:
		deployment.Error = ""
		if err := s.SetDeploymentStatus(ctx, deployment, deploy.StatusCancelled, notifier); err != nil {
			return err
		}
		return nil
	default:
		if !hadCancel {
			return fmt.Errorf("no operation is currently running for this deployment")
		}
		return nil
	}
}

// finishWithError ends a run that returned an error, reporting a user-initiated
// cancellation distinctly from a genuine failure or timeout. Status persistence
// uses the background ctx (not the cancelled runCtx) so the final state is still
// saved.
func (s *Service) finishWithError(ctx, runCtx context.Context, deployment *deploy.Deployment, job models.JobStatus, notifier Notifier, cause error) {
	// Deadlines are failures with guidance, not user cancels.
	if runCtx.Err() == context.Canceled {
		deployment.Error = ""
		if !s.transitionDeploymentStatus(ctx, deployment, deploy.StatusCancelled, notifier, job) {
			return
		}
		s.emitJobStatus(notifier, job, "failed", deployment.Name+" cancelled.")
		return
	}
	s.failDeployment(ctx, deployment, job, notifier, cause)
}

func (s *Service) runDeploymentPlan(deployment *deploy.Deployment, job models.JobStatus, notifier Notifier) {
	ctx := context.Background()
	runCtx, cancel := context.WithCancel(ctx)
	defer cancel()
	s.registerDeployCancel(deployment.ID, cancel)
	defer s.clearDeployCancel(deployment.ID)

	if !s.transitionDeploymentStatus(ctx, deployment, deploy.StatusPlanning, notifier, job) {
		return
	}
	s.emitJobStatus(notifier, job, "running", "Planning "+deployment.Name+".")

	baseLog := s.deploymentLogger(deployment.ID, job.JobID, notifier)
	onLine, stopProgress := deploy.WithProgressHeartbeat(runCtx, baseLog)
	defer stopProgress()
	onLine("Checking " + s.targetLabel(deployment) + " connectivity...")
	deploy.NormaliseDeploymentTarget(deployment)
	if err := s.deployer.Preflight(runCtx, deployment); err != nil {
		s.finishWithError(ctx, runCtx, deployment, job, notifier, err)
		return
	}
	onLine(s.targetLabel(deployment) + " is reachable. Starting OpenTofu plan...")
	summary, err := s.deployer.Plan(runCtx, deployment, onLine)
	if err != nil {
		s.finishWithError(ctx, runCtx, deployment, job, notifier, err)
		return
	}
	deployment.Plan = &summary
	deployment.Error = ""
	if !s.transitionDeploymentStatus(ctx, deployment, deploy.StatusPlanned, notifier, job) {
		return
	}
	s.emitJobStatus(notifier, job, "completed", fmt.Sprintf("Plan ready: +%d ~%d -%d.", summary.Add, summary.Change, summary.Destroy))
}

func (s *Service) runDeploymentAction(deployment *deploy.Deployment, action deploymentAction, job models.JobStatus, notifier Notifier) {
	ctx := context.Background()
	runCtx, cancel := context.WithCancel(ctx)
	defer cancel()
	s.registerDeployCancel(deployment.ID, cancel)
	defer s.clearDeployCancel(deployment.ID)

	baseLog := s.deploymentLogger(deployment.ID, job.JobID, notifier)
	onLine, stopProgress := deploy.WithProgressHeartbeat(runCtx, baseLog)
	defer stopProgress()

	deploy.NormaliseDeploymentTarget(deployment)
	onLine("Checking " + s.targetLabel(deployment) + " connectivity...")
	if err := s.deployer.Preflight(runCtx, deployment); err != nil {
		s.finishWithError(ctx, runCtx, deployment, job, notifier, err)
		return
	}

	if action == actionDestroy {
		if !s.transitionDeploymentStatus(ctx, deployment, deploy.StatusDestroying, notifier, job) {
			return
		}
		s.emitJobStatus(notifier, job, "running", "Destroying "+deployment.Name+".")
		if err := s.deployer.Destroy(runCtx, deployment, onLine); err != nil {
			if runCtx.Err() == context.Canceled {
				// User stopped the destroy. Resources are likely still present (or partially destroyed).
				// Revert to applied so the Destroy button is available again and delete is blocked.
				deployment.Error = ""
				if !s.transitionDeploymentStatus(ctx, deployment, deploy.StatusApplied, notifier, job) {
					return
				}
				s.emitJobStatus(notifier, job, "failed", deployment.Name+" destroy was stopped. Resources may still exist — destroy again to clean up.")
				return
			}
			s.finishWithError(ctx, runCtx, deployment, job, notifier, err)
			return
		}
		deployment.Outputs = nil
		deployment.Error = ""
		if !s.transitionDeploymentStatus(ctx, deployment, deploy.StatusDestroyed, notifier, job) {
			return
		}
		s.emitJobStatus(notifier, job, "completed", deployment.Name+" destroyed.")
		return
	}

	if action == actionRetryPostApply {
		if deployment.Status != deploy.StatusApplied {
			s.failDeployment(ctx, deployment, job, notifier, fmt.Errorf("retry post-apply requires an applied deployment"))
			return
		}
		if strings.TrimSpace(deployment.PostApplyError) == "" {
			s.failDeployment(ctx, deployment, job, notifier, fmt.Errorf("deployment has no post-apply error to retry"))
			return
		}
		s.emitJobStatus(notifier, job, "running", "Retrying post-apply steps for "+deployment.Name+".")
		if err := s.deployer.RetryPostApply(runCtx, deployment, onLine); err != nil {
			deployment.PostApplyError = err.Error()
			deployment.Error = ""
			if !s.transitionDeploymentStatus(ctx, deployment, deploy.StatusApplied, notifier, job) {
				return
			}
			s.emitJobStatus(notifier, job, "failed", err.Error())
			return
		}
		deployment.PostApplyError = ""
		deployment.Error = ""
		if !s.transitionDeploymentStatus(ctx, deployment, deploy.StatusApplied, notifier, job) {
			return
		}
		s.emitJobStatus(notifier, job, "completed", "Post-apply steps completed for "+deployment.Name+".")
		return
	}

	if !s.transitionDeploymentStatus(ctx, deployment, deploy.StatusApplying, notifier, job) {
		return
	}
	s.emitJobStatus(notifier, job, "running", "Applying "+deployment.Name+".")
	result, err := s.deployer.Apply(runCtx, deployment, onLine)
	if err != nil {
		s.finishWithError(ctx, runCtx, deployment, job, notifier, err)
		return
	}
	deployment.Outputs = result.Outputs
	deployment.PostApplyError = result.PostApplyError
	deployment.Error = ""
	if !s.transitionDeploymentStatus(ctx, deployment, deploy.StatusApplied, notifier, job) {
		return
	}
	if result.PostApplyError != "" {
		s.emitJobStatus(notifier, job, "completed", deployment.Name+" deployed; post-apply step failed (retry available).")
		return
	}
	s.emitJobStatus(notifier, job, "completed", deployment.Name+" deployed.")
}

func (s *Service) deploymentLogger(deploymentID, jobID string, notifier Notifier) func(string) {
	if notifier == nil {
		return func(string) {}
	}
	return func(line string) {
		_ = notifier.Notify("deployment.log", deploymentLogEvent{DeploymentID: deploymentID, JobID: jobID, Line: line})
	}
}

func (s *Service) SetDeploymentStatus(ctx context.Context, deployment *deploy.Deployment, status deploy.Status, notifier Notifier) error {
	previousStatus := deployment.Status
	previousUpdatedAt := deployment.UpdatedAt
	deployment.Status = status
	deployment.UpdatedAt = s.timestamp()
	if err := s.SaveDeployment(ctx, deployment, deployment.UpdatedAt); err != nil {
		deployment.Status = previousStatus
		deployment.UpdatedAt = previousUpdatedAt
		return err
	}
	if notifier != nil {
		// Notify a snapshot so listeners cannot race with later status updates on
		// the shared deployment pointer (see TestDeploymentCancelStopsRunningPlan).
		snapshot := *deployment
		_ = notifier.Notify("deployment.changed", &snapshot)
	}
	return nil
}

func (s *Service) transitionDeploymentStatus(ctx context.Context, deployment *deploy.Deployment, status deploy.Status, notifier Notifier, job models.JobStatus) bool {
	if err := s.SetDeploymentStatus(ctx, deployment, status, notifier); err != nil {
		log.Printf("deployments: refusing unsafe persistence for %s: %v", deployment.ID, err)
		s.emitJobStatus(notifier, job, "failed", "Could not save the deployment status. Check the diagnostics log for details.")
		return false
	}
	return true
}

func (s *Service) SaveDeployment(ctx context.Context, deployment *deploy.Deployment, timestamp string) error {
	sealed, err := s.secrets.SealForStore(deployment)
	if err != nil {
		return err
	}
	return s.store.SaveDeployment(ctx, deployment.ID, sealed, timestamp)
}

func (s *Service) failDeployment(ctx context.Context, deployment *deploy.Deployment, job models.JobStatus, notifier Notifier, cause error) {
	deployment.Error = cause.Error()
	if !s.transitionDeploymentStatus(ctx, deployment, deploy.StatusFailed, notifier, job) {
		return
	}
	s.emitJobStatus(notifier, job, "failed", cause.Error())
}

func (s *Service) emitJobStatus(notifier Notifier, job models.JobStatus, status, message string) {
	update := models.JobStatus{JobID: job.JobID, Label: job.Label, Status: status, Message: message}
	if status == "completed" || status == "failed" {
		update.CompletedAt = s.timestamp()
	}
	s.notifyJob(notifier, update)
}

func (s *Service) HandleRecipesGet(params json.RawMessage) (any, error) {
	var request struct {
		RecipeID string `json:"recipeId"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	return s.recipes.Load(request.RecipeID)
}

func (s *Service) HandleTofuInstall(notifier Notifier) (any, error) {
	job := models.JobStatus{JobID: s.newJobID(), Label: "Install OpenTofu", Status: "queued", Message: "Preparing the OpenTofu engine."}
	go s.runTofuInstall(job, notifier)
	return job, nil
}

func (s *Service) HandleDeploymentsGet(ctx context.Context, params json.RawMessage) (any, error) {
	var request struct {
		DeploymentID string `json:"deploymentId"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	return s.DeploymentGet(ctx, request.DeploymentID)
}

func (s *Service) HandleDeploymentsPlan(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
	var request deploymentPlanRequest
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	return s.startDeploymentPlan(ctx, request, notifier)
}

func (s *Service) HandleDeploymentsApply(params json.RawMessage, notifier Notifier) (any, error) {
	var request struct {
		DeploymentID   string `json:"deploymentId"`
		PolicyOverride string `json:"policyOverride,omitempty"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	return s.startDeploymentAction(request.DeploymentID, actionApply, request.PolicyOverride, notifier)
}

func (s *Service) HandleDeploymentsDestroy(params json.RawMessage, notifier Notifier) (any, error) {
	var request struct {
		DeploymentID string `json:"deploymentId"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	return s.startDeploymentAction(request.DeploymentID, actionDestroy, "", notifier)
}

func (s *Service) HandleDeploymentsCancel(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
	var request struct {
		DeploymentID string `json:"deploymentId"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	if err := s.cancelDeployment(ctx, request.DeploymentID, notifier); err != nil {
		return nil, err
	}
	return map[string]bool{"cancelled": true}, nil
}

func (s *Service) HandleDeploymentsCheckDrift(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
	var request struct {
		DeploymentID string `json:"deploymentId"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	deployment, err := s.DeploymentGet(ctx, request.DeploymentID)
	if err != nil {
		return nil, err
	}
	// Drift is only meaningful against applied (or previously planned) live state.
	switch deployment.Status {
	case deploy.StatusApplied, deploy.StatusPlanned, deploy.StatusFailed:
		// ok
	default:
		return nil, fmt.Errorf("drift check is only supported for applied, planned, or failed deployments (status=%s)", deployment.Status)
	}
	drift, err := s.deployer.CheckDrift(ctx, deployment, s.deploymentLogger(deployment.ID, "", notifier))
	if err != nil {
		return nil, err
	}
	deployment.Drift = &drift
	deployment.UpdatedAt = s.timestamp()
	if err := s.SaveDeployment(ctx, deployment, deployment.UpdatedAt); err != nil {
		return nil, err
	}
	if notifier != nil {
		_ = notifier.Notify("deployment.changed", deployment)
	}
	return deploymentDriftResult{Deployment: deployment, Drift: drift}, nil
}

func (s *Service) HandleDeploymentsRetryPostApply(params json.RawMessage, notifier Notifier) (any, error) {
	var request struct {
		DeploymentID string `json:"deploymentId"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	return s.startDeploymentAction(request.DeploymentID, actionRetryPostApply, "", notifier)
}

func (s *Service) HandleDeploymentsDelete(ctx context.Context, params json.RawMessage) (any, error) {
	var request struct {
		DeploymentID string `json:"deploymentId"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	return map[string]bool{"deleted": true}, s.deleteDeployment(ctx, request.DeploymentID)
}

// handleRecipesValidate runs C1 validation against a local recipe folder.
func (s *Service) HandleRecipesValidate(params json.RawMessage) (any, error) {
	var req struct {
		SourcePath string `json:"sourcePath"`
	}
	if err := json.Unmarshal(params, &req); err != nil {
		return nil, err
	}
	return recipes.ValidateDirectory(req.SourcePath)
}

// handleRecipesImport provides local import (folder or zip) with a trust gate (C2).
// Without confirm=true, only a preview + validation report is returned (no durable write).
// With confirm=true, the tree is copied under ImportedRecipesDir as <safeId>@<safeVersion>.
func (s *Service) HandleRecipesImport(params json.RawMessage) (any, error) {
	var req struct {
		SourcePath string `json:"sourcePath"`
		// SourceType is "folder", "zip", or empty (auto-detect from extension / directory).
		SourceType string `json:"sourceType,omitempty"`
		Confirm    bool   `json:"confirm"`
	}
	if err := json.Unmarshal(params, &req); err != nil {
		return nil, err
	}
	if strings.TrimSpace(req.SourcePath) == "" {
		return nil, fmt.Errorf("sourcePath (folder or .zip) is required")
	}
	srcPath := filepath.Clean(req.SourcePath)
	sourceType := strings.ToLower(strings.TrimSpace(req.SourceType))
	if sourceType == "" {
		if strings.EqualFold(filepath.Ext(srcPath), ".zip") {
			sourceType = "zip"
		} else {
			sourceType = "folder"
		}
	}

	workDir := srcPath
	var cleanup func()
	if sourceType == "zip" {
		extracted, err := extractRecipeZip(srcPath)
		if err != nil {
			return nil, err
		}
		workDir = extracted
		cleanup = func() { _ = os.RemoveAll(extracted) }
		defer cleanup()
	} else if sourceType != "folder" {
		return nil, fmt.Errorf("unsupported sourceType %q (use folder or zip)", sourceType)
	}

	report, err := recipes.ValidateDirectory(workDir)
	if err != nil {
		return nil, err
	}
	if !report.OK {
		return map[string]any{
			"ok":         false,
			"confirmed":  false,
			"sourceType": sourceType,
			"validation": report,
			"trustNote":  "Import blocked: fix validation errors before accepting.",
		}, nil
	}

	manifestPath := filepath.Join(workDir, "recipe.yaml")
	data, err := os.ReadFile(manifestPath)
	if err != nil {
		return nil, fmt.Errorf("read recipe.yaml from %s: %w", workDir, err)
	}
	var m recipes.Manifest
	if err := yaml.Unmarshal(data, &m); err != nil {
		return nil, fmt.Errorf("parse manifest: %w", err)
	}
	if strings.TrimSpace(m.ID) == "" {
		m.ID = filepath.Base(workDir)
	}
	if err := m.Validate(); err != nil {
		return nil, fmt.Errorf("invalid manifest: %w", err)
	}
	safeID, err := SafeRecipePathSegment(m.ID, "id")
	if err != nil {
		return nil, err
	}
	safeVer, err := SafeRecipePathSegment(m.Version, "version")
	if err != nil {
		return nil, err
	}
	targetName := fmt.Sprintf("%s@%s", safeID, safeVer)
	dest := filepath.Join(s.settings.ImportedRecipesDir, targetName)
	importedRoot := filepath.Clean(s.settings.ImportedRecipesDir)
	cleanDest := filepath.Clean(dest)
	if cleanDest != importedRoot && !strings.HasPrefix(cleanDest, importedRoot+string(os.PathSeparator)) {
		return nil, fmt.Errorf("import destination escapes imported recipes directory")
	}

	contentHash, err := recipes.ContentHash(workDir)
	if err != nil {
		return nil, fmt.Errorf("content hash: %w", err)
	}

	preview := map[string]any{
		"ok":            true,
		"id":            m.ID,
		"version":       m.Version,
		"name":          m.Name,
		"kind":          m.Kind,
		"providers":     m.Providers,
		"summary":       m.Summary,
		"buildCommands": report.BuildCommands,
		"labStepCount":  report.LabStepCount,
		"contentHash":   contentHash,
		"sourceType":    sourceType,
		"sourcePath":    srcPath,
		"importedPath":  dest,
		"confirmed":     false,
		"validation":    report,
		"trustNote":     "Review providers, build commands, and lab actions. These run on this machine. Call again with confirm=true to copy into imported recipes.",
	}
	if !req.Confirm {
		return preview, nil
	}

	if err := os.RemoveAll(dest); err != nil && !os.IsNotExist(err) {
		return nil, err
	}
	if err := os.MkdirAll(dest, 0o755); err != nil {
		return nil, err
	}
	if err := copyRecipeTree(workDir, dest); err != nil {
		_ = os.RemoveAll(dest)
		return nil, fmt.Errorf("copy import: %w", err)
	}
	trust := recipes.ImportTrust{
		ContentHash: contentHash,
		AcceptedAt:  s.timestamp(),
		SourceType:  sourceType,
		SourcePath:  srcPath,
		ID:          m.ID,
		Version:     m.Version,
	}
	trustBytes, _ := json.MarshalIndent(trust, "", "  ")
	if err := os.WriteFile(filepath.Join(dest, recipes.TrustFileName()), trustBytes, 0o644); err != nil {
		_ = os.RemoveAll(dest)
		return nil, fmt.Errorf("write trust record: %w", err)
	}
	preview["confirmed"] = true
	preview["trustNote"] = "Import accepted and copied. A changed content hash will require re-acceptance."
	return preview, nil
}

// extractRecipeZip unpacks a zip into a temp directory and returns the recipe root
// (directory containing recipe.yaml, possibly one level down).
func extractRecipeZip(zipPath string) (string, error) {
	info, err := os.Stat(zipPath)
	if err != nil {
		return "", fmt.Errorf("open zip: %w", err)
	}
	if info.IsDir() {
		return "", fmt.Errorf("zip path is a directory: %s", zipPath)
	}
	reader, err := zip.OpenReader(zipPath)
	if err != nil {
		return "", fmt.Errorf("open zip: %w", err)
	}
	defer reader.Close()

	tmp, err := os.MkdirTemp("", "cs-recipe-import-*")
	if err != nil {
		return "", err
	}
	cleanTmp := filepath.Clean(tmp)
	// Caps protect against zip bombs (highly compressed payloads expanding on disk).
	const maxEntryBytes int64 = 32 << 20  // 32 MiB per file
	const maxTotalBytes int64 = 128 << 20 // 128 MiB total uncompressed
	var totalWritten int64
	for _, file := range reader.File {
		// Zip Slip: reject raw archive paths that contain ".." before any join
		// (CodeQL go/zipslip; also covers Windows-style separators).
		if strings.Contains(file.Name, "..") {
			_ = os.RemoveAll(tmp)
			return "", fmt.Errorf("zip entry escapes root: %s", file.Name)
		}
		name := filepath.Clean(file.Name)
		if name == "." || name == "" || filepath.IsAbs(name) {
			_ = os.RemoveAll(tmp)
			return "", fmt.Errorf("zip entry escapes root: %s", file.Name)
		}
		// Normalise to slash for skip checks.
		if shouldSkipImportPath(filepath.ToSlash(name), nil) {
			continue
		}
		target := filepath.Join(tmp, name)
		// Double-check the resolved path stays under the extraction root.
		rel, relErr := filepath.Rel(cleanTmp, filepath.Clean(target))
		if relErr != nil || rel == ".." || strings.HasPrefix(rel, ".."+string(os.PathSeparator)) {
			_ = os.RemoveAll(tmp)
			return "", fmt.Errorf("zip entry escapes root: %s", file.Name)
		}
		if file.FileInfo().IsDir() {
			if err := os.MkdirAll(target, 0o755); err != nil {
				_ = os.RemoveAll(tmp)
				return "", err
			}
			continue
		}
		// UncompressedSize64 is a declared size; still enforce LimitReader below.
		if file.UncompressedSize64 > uint64(maxEntryBytes) {
			_ = os.RemoveAll(tmp)
			return "", fmt.Errorf("zip entry %q exceeds max size (%d bytes)", file.Name, maxEntryBytes)
		}
		if totalWritten+int64(file.UncompressedSize64) > maxTotalBytes {
			_ = os.RemoveAll(tmp)
			return "", fmt.Errorf("zip total uncompressed size would exceed %d bytes", maxTotalBytes)
		}
		if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
			_ = os.RemoveAll(tmp)
			return "", err
		}
		rc, err := file.Open()
		if err != nil {
			_ = os.RemoveAll(tmp)
			return "", err
		}
		out, err := os.OpenFile(target, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o644)
		if err != nil {
			_ = rc.Close()
			_ = os.RemoveAll(tmp)
			return "", err
		}
		// LimitReader caps actual bytes written even if UncompressedSize64 lies.
		limited := io.LimitReader(rc, maxEntryBytes+1)
		n, copyErr := io.Copy(out, limited)
		_ = out.Close()
		_ = rc.Close()
		if copyErr != nil {
			_ = os.RemoveAll(tmp)
			return "", copyErr
		}
		if n > maxEntryBytes {
			_ = os.RemoveAll(tmp)
			return "", fmt.Errorf("zip entry %q exceeds max size (%d bytes)", file.Name, maxEntryBytes)
		}
		totalWritten += n
		if totalWritten > maxTotalBytes {
			_ = os.RemoveAll(tmp)
			return "", fmt.Errorf("zip total uncompressed size exceeds %d bytes", maxTotalBytes)
		}
	}

	// Prefer a root recipe.yaml; otherwise a single top-level subdir that has one.
	if _, err := os.Stat(filepath.Join(tmp, "recipe.yaml")); err == nil {
		return tmp, nil
	}
	entries, err := os.ReadDir(tmp)
	if err != nil {
		_ = os.RemoveAll(tmp)
		return "", err
	}
	var candidates []string
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		if _, err := os.Stat(filepath.Join(tmp, entry.Name(), "recipe.yaml")); err == nil {
			candidates = append(candidates, filepath.Join(tmp, entry.Name()))
		}
	}
	if len(candidates) == 1 {
		return candidates[0], nil
	}
	if len(candidates) == 0 {
		_ = os.RemoveAll(tmp)
		return "", fmt.Errorf("zip does not contain recipe.yaml at root or in a single top-level folder")
	}
	_ = os.RemoveAll(tmp)
	return "", fmt.Errorf("zip contains multiple recipe.yaml roots; repackage with a single recipe")
}

func copyRecipeTree(src, dest string) error {
	cleanDest := filepath.Clean(dest)
	return filepath.WalkDir(src, func(path string, d fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		rel, err := filepath.Rel(src, path)
		if err != nil {
			return err
		}
		if rel == "." {
			return nil
		}
		if shouldSkipImportPath(rel, d) {
			if d.IsDir() {
				return fs.SkipDir
			}
			return nil
		}
		tgt := filepath.Join(dest, rel)
		if !strings.HasPrefix(filepath.Clean(tgt), cleanDest+string(os.PathSeparator)) && filepath.Clean(tgt) != cleanDest {
			return fmt.Errorf("refusing to write outside import destination: %s", rel)
		}
		if d.IsDir() {
			return os.MkdirAll(tgt, 0o755)
		}
		b, err := os.ReadFile(path)
		if err != nil {
			return err
		}
		if err := os.MkdirAll(filepath.Dir(tgt), 0o755); err != nil {
			return err
		}
		return os.WriteFile(tgt, b, 0o644)
	})
}

// handleRecipesScaffold (C3) generates a minimal starter in the given dest dir (authoring scaffold).
func (s *Service) HandleRecipesScaffold(params json.RawMessage) (any, error) {
	var req struct {
		DestDir  string `json:"destDir"`
		Provider string `json:"provider"`
	}
	if err := json.Unmarshal(params, &req); err != nil {
		return nil, err
	}
	if req.DestDir == "" {
		return nil, fmt.Errorf("destDir required for scaffold")
	}
	if err := os.MkdirAll(req.DestDir, 0o755); err != nil {
		return nil, err
	}
	prov := req.Provider
	if prov == "" {
		prov = "aws"
	}
	runtimeID := "localstack"
	switch strings.ToLower(strings.TrimSpace(prov)) {
	case "azure":
		runtimeID = "floci-az"
	case "docker", "compose":
		runtimeID = "docker-compose"
	}
	recipeYaml := fmt.Sprintf(`apiVersion: cloudsprocket.recipe/v1
id: my-custom-recipe
version: 0.1.0
name: My Custom Recipe
summary: Starter generated by scaffold.
kind: app-deploy
providers: ["%s"]
engine:
  type: opentofu
  minVersion: "1.6.0"
local:
  runtimes:
    - id: %s
variables: []
`, prov, runtimeID)
	mainTf := `resource "null_resource" "placeholder" {}
output "example" { value = "hello" }
`
	files := map[string][]byte{
		"recipe.yaml":  []byte(recipeYaml),
		"main.tf":      []byte(mainTf),
		"variables.tf": []byte(""),
		"outputs.tf":   []byte(""),
	}
	for name, content := range files {
		path := filepath.Join(req.DestDir, name)
		if err := os.WriteFile(path, content, 0o644); err != nil {
			return nil, fmt.Errorf("scaffold write %s: %w", name, err)
		}
	}
	return map[string]string{"status": "scaffolded", "path": req.DestDir}, nil
}

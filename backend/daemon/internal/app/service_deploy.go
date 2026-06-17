package app

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"cloudsprocket/backend/daemon/internal/deploy"
	"cloudsprocket/backend/daemon/internal/models"
)

// deploymentPlanRequest is the payload for deployments.plan.
type deploymentPlanRequest struct {
	RecipeID   string         `json:"recipeId"`
	Name       string         `json:"name"`
	ProviderID string         `json:"providerId"`
	ProfileID  string         `json:"profileId"`
	Local      bool           `json:"local"`
	RuntimeID  string         `json:"runtimeId,omitempty"`
	Variables  map[string]any `json:"variables"`
}

// deploymentJob is returned by plan/apply/destroy: the deployment record plus
// the background job tracking the operation.
type deploymentJob struct {
	Deployment *deploy.Deployment `json:"deployment"`
	Job        models.JobStatus   `json:"job"`
}

// deploymentLogEvent is streamed per tofu output line.
type deploymentLogEvent struct {
	DeploymentID string `json:"deploymentId"`
	JobID        string `json:"jobId"`
	Line         string `json:"line"`
}

type tofuStatus struct {
	Available bool   `json:"available"`
	Version   string `json:"version"`
	Path      string `json:"path"`
}

type deploymentAction int

const (
	actionApply deploymentAction = iota
	actionDestroy
)

func (s *Service) newJobID() string {
	return fmt.Sprintf("job-%d", s.now().UnixNano())
}

// targetLabel names a deployment's target for log lines via the deploy engine.
func (s *Service) targetLabel(deployment *deploy.Deployment) string {
	return s.deployer.TargetLabel(deployment)
}

func (s *Service) tofuStatus(ctx context.Context) tofuStatus {
	available := s.deployer.Available()
	version := ""
	if available {
		version, _ = s.deployer.Version(ctx)
	}
	return tofuStatus{Available: available, Version: version, Path: s.deployer.BinaryPath()}
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

func (s *Service) deploymentsList(ctx context.Context) ([]deploy.Deployment, error) {
	payloads, err := s.store.ListDeploymentsJSON(ctx)
	if err != nil {
		return nil, err
	}
	deployments := make([]deploy.Deployment, 0, len(payloads))
	for _, payload := range payloads {
		var deployment deploy.Deployment
		if err := json.Unmarshal(payload, &deployment); err != nil {
			continue
		}
		s.openFromStore(&deployment)
		deployments = append(deployments, deployment)
	}
	return deployments, nil
}

func (s *Service) deploymentGet(ctx context.Context, id string) (*deploy.Deployment, error) {
	var deployment deploy.Deployment
	found, err := s.store.LoadDeployment(ctx, id, &deployment)
	if err != nil {
		return nil, err
	}
	if !found {
		return nil, fmt.Errorf("deployment %s not found", id)
	}
	s.openFromStore(&deployment)
	return &deployment, nil
}

// deleteDeployment removes a deployment record and its on-disk workspace. It
// refuses to delete a deployment that is mid-operation (stop it first) or one
// with live infrastructure (destroy it first), so a record is never orphaned
// from resources it still owns.
func (s *Service) deleteDeployment(ctx context.Context, id string) error {
	deployment, err := s.deploymentGet(ctx, id)
	if err != nil {
		return err
	}
	switch deployment.Status {
	case deploy.StatusPlanning, deploy.StatusApplying, deploy.StatusDestroying:
		return fmt.Errorf("this deployment is still running; stop it before removing it")
	case deploy.StatusApplied:
		return fmt.Errorf("this deployment still has live resources; destroy it before removing it")
	}
	if err := s.store.DeleteDeployment(ctx, id); err != nil {
		return err
	}
	if err := s.deployer.RemoveWorkspace(id); err != nil {
		return err
	}
	return nil
}

func (s *Service) startDeploymentPlan(ctx context.Context, request deploymentPlanRequest, notifier Notifier) (deploymentJob, error) {
	if strings.TrimSpace(request.RecipeID) == "" {
		return deploymentJob{}, fmt.Errorf("recipeId is required")
	}
	recipe, err := s.recipes.Load(request.RecipeID)
	if err != nil {
		return deploymentJob{}, err
	}

	name := strings.TrimSpace(request.Name)
	if name == "" {
		name = request.RecipeID
	}
	now := s.timestamp()
	deployment := &deploy.Deployment{
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
	}
	if err := s.store.SaveDeployment(ctx, deployment.ID, s.sealForStore(deployment), now); err != nil {
		return deploymentJob{}, err
	}

	job := models.JobStatus{JobID: s.newJobID(), Label: "Plan " + name, Status: "queued", Message: "Planning deployment."}
	go s.runDeploymentPlan(deployment, job, notifier)
	return deploymentJob{Deployment: deployment, Job: job}, nil
}

func (s *Service) startDeploymentAction(id string, action deploymentAction, notifier Notifier) (deploymentJob, error) {
	deployment, err := s.deploymentGet(context.Background(), id)
	if err != nil {
		return deploymentJob{}, err
	}
	label := "Apply " + deployment.Name
	if action == actionDestroy {
		label = "Destroy " + deployment.Name
	}
	job := models.JobStatus{JobID: s.newJobID(), Label: label, Status: "queued", Message: label + "."}
	go s.runDeploymentAction(deployment, action, job, notifier)
	return deploymentJob{Deployment: deployment, Job: job}, nil
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
// cancelling its run context, which kills the underlying tofu process.
func (s *Service) cancelDeployment(id string) error {
	s.deployCancelsMu.Lock()
	cancel := s.deployCancels[id]
	s.deployCancelsMu.Unlock()
	if cancel == nil {
		return fmt.Errorf("no operation is currently running for this deployment")
	}
	cancel()
	return nil
}

// finishWithError ends a run that returned an error, reporting a user-initiated
// cancellation distinctly from a genuine failure. Status persistence uses the
// background ctx (not the cancelled runCtx) so the final state is still saved.
func (s *Service) finishWithError(ctx, runCtx context.Context, deployment *deploy.Deployment, job models.JobStatus, notifier Notifier, cause error) {
	if runCtx.Err() == context.Canceled {
		deployment.Error = ""
		s.setDeploymentStatus(ctx, deployment, deploy.StatusCancelled, notifier)
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

	s.setDeploymentStatus(ctx, deployment, deploy.StatusPlanning, notifier)
	s.emitJobStatus(notifier, job, "running", "Planning "+deployment.Name+".")

	onLine := s.deploymentLogger(deployment.ID, job.JobID, notifier)
	onLine("Checking " + s.targetLabel(deployment) + " connectivity...")
	if err := s.deployer.Preflight(runCtx, deployment); err != nil {
		s.finishWithError(ctx, runCtx, deployment, job, notifier, err)
		return
	}
	if err := s.deployer.Prepare(deployment); err != nil {
		s.finishWithError(ctx, runCtx, deployment, job, notifier, err)
		return
	}
	summary, err := s.deployer.Plan(runCtx, deployment, onLine)
	if err != nil {
		s.finishWithError(ctx, runCtx, deployment, job, notifier, err)
		return
	}
	deployment.Plan = &summary
	deployment.Error = ""
	s.setDeploymentStatus(ctx, deployment, deploy.StatusPlanned, notifier)
	s.emitJobStatus(notifier, job, "completed", fmt.Sprintf("Plan ready: +%d ~%d -%d.", summary.Add, summary.Change, summary.Destroy))
}

func (s *Service) runDeploymentAction(deployment *deploy.Deployment, action deploymentAction, job models.JobStatus, notifier Notifier) {
	ctx := context.Background()
	runCtx, cancel := context.WithCancel(ctx)
	defer cancel()
	s.registerDeployCancel(deployment.ID, cancel)
	defer s.clearDeployCancel(deployment.ID)

	onLine := s.deploymentLogger(deployment.ID, job.JobID, notifier)

	onLine("Checking " + s.targetLabel(deployment) + " connectivity...")
	if err := s.deployer.Preflight(runCtx, deployment); err != nil {
		s.finishWithError(ctx, runCtx, deployment, job, notifier, err)
		return
	}

	if action == actionDestroy {
		s.setDeploymentStatus(ctx, deployment, deploy.StatusDestroying, notifier)
		s.emitJobStatus(notifier, job, "running", "Destroying "+deployment.Name+".")
		if err := s.deployer.Destroy(runCtx, deployment, onLine); err != nil {
			s.finishWithError(ctx, runCtx, deployment, job, notifier, err)
			return
		}
		deployment.Outputs = nil
		deployment.Error = ""
		s.setDeploymentStatus(ctx, deployment, deploy.StatusDestroyed, notifier)
		s.emitJobStatus(notifier, job, "completed", deployment.Name+" destroyed.")
		return
	}

	s.setDeploymentStatus(ctx, deployment, deploy.StatusApplying, notifier)
	s.emitJobStatus(notifier, job, "running", "Applying "+deployment.Name+".")
	outputs, err := s.deployer.Apply(runCtx, deployment, onLine)
	if err != nil {
		s.finishWithError(ctx, runCtx, deployment, job, notifier, err)
		return
	}
	deployment.Outputs = outputs
	deployment.Error = ""
	s.setDeploymentStatus(ctx, deployment, deploy.StatusApplied, notifier)
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

func (s *Service) setDeploymentStatus(ctx context.Context, deployment *deploy.Deployment, status deploy.Status, notifier Notifier) {
	deployment.Status = status
	deployment.UpdatedAt = s.timestamp()
	_ = s.store.SaveDeployment(ctx, deployment.ID, s.sealForStore(deployment), deployment.UpdatedAt)
	if notifier != nil {
		_ = notifier.Notify("deployment.changed", deployment)
	}
}

func (s *Service) failDeployment(ctx context.Context, deployment *deploy.Deployment, job models.JobStatus, notifier Notifier, cause error) {
	deployment.Error = cause.Error()
	s.setDeploymentStatus(ctx, deployment, deploy.StatusFailed, notifier)
	s.emitJobStatus(notifier, job, "failed", cause.Error())
}

func (s *Service) emitJobStatus(notifier Notifier, job models.JobStatus, status, message string) {
	update := models.JobStatus{JobID: job.JobID, Label: job.Label, Status: status, Message: message}
	if status == "completed" || status == "failed" {
		update.CompletedAt = s.timestamp()
	}
	s.notifyJob(notifier, update)
}

func (s *Service) handleRecipesGet(params json.RawMessage) (any, error) {
	var request struct {
		RecipeID string `json:"recipeId"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	return s.recipes.Load(request.RecipeID)
}

func (s *Service) handleTofuInstall(notifier Notifier) (any, error) {
	job := models.JobStatus{JobID: s.newJobID(), Label: "Install OpenTofu", Status: "queued", Message: "Preparing the OpenTofu engine."}
	go s.runTofuInstall(job, notifier)
	return job, nil
}

func (s *Service) handleDeploymentsGet(ctx context.Context, params json.RawMessage) (any, error) {
	var request struct {
		DeploymentID string `json:"deploymentId"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	return s.deploymentGet(ctx, request.DeploymentID)
}

func (s *Service) handleDeploymentsPlan(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
	var request deploymentPlanRequest
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	return s.startDeploymentPlan(ctx, request, notifier)
}

func (s *Service) handleDeploymentsApply(params json.RawMessage, notifier Notifier) (any, error) {
	var request struct {
		DeploymentID string `json:"deploymentId"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	return s.startDeploymentAction(request.DeploymentID, actionApply, notifier)
}

func (s *Service) handleDeploymentsDestroy(params json.RawMessage, notifier Notifier) (any, error) {
	var request struct {
		DeploymentID string `json:"deploymentId"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	return s.startDeploymentAction(request.DeploymentID, actionDestroy, notifier)
}

func (s *Service) handleDeploymentsCancel(params json.RawMessage) (any, error) {
	var request struct {
		DeploymentID string `json:"deploymentId"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	return map[string]bool{"cancelled": true}, s.cancelDeployment(request.DeploymentID)
}

func (s *Service) handleDeploymentsDelete(ctx context.Context, params json.RawMessage) (any, error) {
	var request struct {
		DeploymentID string `json:"deploymentId"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	return map[string]bool{"deleted": true}, s.deleteDeployment(ctx, request.DeploymentID)
}

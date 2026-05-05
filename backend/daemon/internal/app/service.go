package app

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"net/url"
	"strings"
	"sync"
	"time"

	"cloudsprocket/backend/daemon/internal/config"
	"cloudsprocket/backend/daemon/internal/discovery"
	"cloudsprocket/backend/daemon/internal/models"
	"cloudsprocket/backend/daemon/internal/store"
	"cloudsprocket/backend/daemon/internal/urlinspector"
)

type S3Inventory interface {
	ListBuckets(ctx context.Context, profile models.ProfileSummary) ([]models.AwsS3Bucket, error)
	ListObjects(ctx context.Context, profile models.ProfileSummary, bucketName string, prefix string) ([]models.AwsS3Object, error)
	HeadObject(ctx context.Context, profile models.ProfileSummary, bucketName string, objectKey string) ([]models.DetailField, error)
	UploadFile(ctx context.Context, profile models.ProfileSummary, bucketName string, objectKey string, sourcePath string) (models.AwsS3UploadResult, error)
	PresignGetObject(ctx context.Context, profile models.ProfileSummary, bucketName string, objectKey string, durationSeconds int) (models.AwsS3PresignResult, error)
}

type EC2Inventory interface {
	ListRegions(ctx context.Context, profile models.ProfileSummary) ([]string, error)
	ListInstances(ctx context.Context, profile models.ProfileSummary, region string) ([]models.AwsEc2Instance, error)
	StartInstance(ctx context.Context, profile models.ProfileSummary, region string, instanceID string) error
	StopInstance(ctx context.Context, profile models.ProfileSummary, region string, instanceID string) error
	RebootInstance(ctx context.Context, profile models.ProfileSummary, region string, instanceID string) error
}

type Notifier interface {
	Notify(method string, payload any) error
}

type Service struct {
	settings  config.Settings
	store     *store.Store
	discovery *discovery.Service
	s3        S3Inventory
	ec2       EC2Inventory
	now       func() time.Time
	mu        sync.Mutex
}

func New(
	settings config.Settings,
	store *store.Store,
	discoveryService *discovery.Service,
	s3Inventory S3Inventory,
	ec2Inventory EC2Inventory,
) *Service {
	return &Service{
		settings:  settings,
		store:     store,
		discovery: discoveryService,
		s3:        s3Inventory,
		ec2:       ec2Inventory,
		now:       func() time.Time { return time.Now().UTC() },
	}
}

func (s *Service) Handle(
	ctx context.Context,
	method string,
	params json.RawMessage,
	notifier Notifier,
) (any, error) {
	switch method {
	case "providers.list":
		snapshot, err := s.discovery.Discover()
		if err != nil {
			return nil, err
		}
		return snapshot.Providers, nil
	case "profiles.list":
		var request struct {
			ProviderID string `json:"providerId"`
		}
		_ = json.Unmarshal(params, &request)
		snapshot, err := s.discovery.Discover()
		if err != nil {
			return nil, err
		}
		return filterProfiles(snapshot.Profiles, request.ProviderID), nil
	case "session.get":
		s.mu.Lock()
		defer s.mu.Unlock()
		_, session, err := s.currentState(ctx)
		return session, err
	case "workspace.get":
		s.mu.Lock()
		defer s.mu.Unlock()
		snapshot, session, err := s.currentState(ctx)
		if err != nil {
			return nil, err
		}
		return s.buildWorkspaceSnapshot(snapshot, session), nil
	case "aws.s3.selectBucket":
		var request struct {
			BucketName string `json:"bucketName"`
		}
		if err := json.Unmarshal(params, &request); err != nil {
			return nil, err
		}
		s.mu.Lock()
		defer s.mu.Unlock()
		snapshot, session, err := s.currentState(ctx)
		if err != nil {
			return nil, err
		}
		if !session.IsLocked || session.CurrentProviderID != "aws" {
			return nil, errors.New("lock an AWS session before selecting an S3 bucket")
		}
		session.SelectedS3BucketName = request.BucketName
		session.SelectedS3ObjectKey = ""
		if err := s.store.SaveSession(ctx, session); err != nil {
			return nil, err
		}
		return s.buildWorkspaceSnapshot(snapshot, session), s.notifyStateAndLog(
			ctx,
			snapshot,
			session,
			notifier,
			"info",
			fmt.Sprintf("Selected S3 bucket %s.", request.BucketName),
		)
	case "aws.s3.selectObject":
		var request struct {
			ObjectKey string `json:"objectKey"`
		}
		if err := json.Unmarshal(params, &request); err != nil {
			return nil, err
		}
		s.mu.Lock()
		defer s.mu.Unlock()
		snapshot, session, err := s.currentState(ctx)
		if err != nil {
			return nil, err
		}
		if !session.IsLocked || session.CurrentProviderID != "aws" || session.SelectedS3BucketName == "" {
			return nil, errors.New("select an S3 bucket before selecting an object")
		}
		session.SelectedS3ObjectKey = request.ObjectKey
		if err := s.store.SaveSession(ctx, session); err != nil {
			return nil, err
		}
		return s.buildWorkspaceSnapshot(snapshot, session), nil
	case "aws.s3.setPrefixFilter":
		var request struct {
			Prefix string `json:"prefix"`
		}
		if err := json.Unmarshal(params, &request); err != nil {
			return nil, err
		}
		s.mu.Lock()
		defer s.mu.Unlock()
		snapshot, session, err := s.currentState(ctx)
		if err != nil {
			return nil, err
		}
		if !session.IsLocked || session.CurrentProviderID != "aws" {
			return nil, errors.New("lock an AWS session before setting an S3 prefix filter")
		}
		session.S3PrefixFilter = request.Prefix
		session.SelectedS3ObjectKey = ""
		if err := s.store.SaveSession(ctx, session); err != nil {
			return nil, err
		}
		return s.buildWorkspaceSnapshot(snapshot, session), s.notifyStateAndLog(
			ctx,
			snapshot,
			session,
			notifier,
			"info",
			fmt.Sprintf("Updated S3 prefix filter to %q.", request.Prefix),
		)
	case "aws.s3.uploadObject":
		var request struct {
			SourcePath string `json:"sourcePath"`
			ObjectKey  string `json:"objectKey"`
		}
		if err := json.Unmarshal(params, &request); err != nil {
			return nil, err
		}
		if strings.TrimSpace(request.SourcePath) == "" || strings.TrimSpace(request.ObjectKey) == "" {
			return nil, errors.New("source path and destination object key are required")
		}
		s.mu.Lock()
		snapshot, session, err := s.currentState(ctx)
		if err != nil {
			s.mu.Unlock()
			return nil, err
		}
		profile, bucketName, err := s.activeS3Selection(snapshot, session, true)
		if err != nil {
			s.mu.Unlock()
			return nil, err
		}
		prefix := session.S3PrefixFilter
		s.mu.Unlock()

		job := models.JobStatus{
			JobID:   fmt.Sprintf("job-%d", s.now().UnixNano()),
			Label:   "S3 Upload",
			Status:  "queued",
			Message: fmt.Sprintf("Uploading %s to s3://%s/%s.", request.SourcePath, bucketName, request.ObjectKey),
		}
		go s.runS3Upload(job, notifier, snapshot, session, profile, bucketName, request.ObjectKey, request.SourcePath, prefix)
		return job, nil
	case "aws.s3.presignObject":
		var request struct {
			DurationSeconds int `json:"durationSeconds"`
		}
		if err := json.Unmarshal(params, &request); err != nil {
			return nil, err
		}
		s.mu.Lock()
		snapshot, session, err := s.currentState(ctx)
		if err != nil {
			s.mu.Unlock()
			return nil, err
		}
		profile, bucketName, err := s.activeS3Selection(snapshot, session, true)
		if err != nil {
			s.mu.Unlock()
			return nil, err
		}
		objectKey := session.SelectedS3ObjectKey
		if objectKey == "" {
			objectKey = s.selectedS3ObjectKey(session, s.s3Objects(ctx, profile, bucketName, session.S3PrefixFilter))
		}
		if objectKey == "" {
			s.mu.Unlock()
			return nil, errors.New("select an S3 object before generating a signed URL")
		}
		s.mu.Unlock()

		job := models.JobStatus{
			JobID:   fmt.Sprintf("job-%d", s.now().UnixNano()),
			Label:   "S3 Signed URL",
			Status:  "queued",
			Message: fmt.Sprintf("Generating a signed URL for %s.", objectKey),
		}
		go s.runS3Presign(job, notifier, profile, bucketName, objectKey, request.DurationSeconds)
		return job, nil
	case "aws.s3.analyseUrl":
		var request struct {
			URL string `json:"url"`
		}
		if err := json.Unmarshal(params, &request); err != nil {
			return nil, err
		}
		return urlinspector.AnalyseURL(request.URL, s.now()), nil
	case "aws.s3.validateUrl":
		var request struct {
			URL string `json:"url"`
		}
		if err := json.Unmarshal(params, &request); err != nil {
			return nil, err
		}
		if strings.TrimSpace(request.URL) == "" {
			return nil, errors.New("URL is required")
		}
		job := models.JobStatus{
			JobID:   fmt.Sprintf("job-%d", s.now().UnixNano()),
			Label:   "S3 URL Validation",
			Status:  "queued",
			Message: "Validating the pasted URL.",
		}
		go s.runURLValidation(job, notifier, request.URL)
		return job, nil
	case "aws.ec2.selectRegion":
		var request struct {
			Region string `json:"region"`
		}
		if err := json.Unmarshal(params, &request); err != nil {
			return nil, err
		}
		s.mu.Lock()
		defer s.mu.Unlock()
		snapshot, session, err := s.currentState(ctx)
		if err != nil {
			return nil, err
		}
		if !session.IsLocked || session.CurrentProviderID != "aws" {
			return nil, errors.New("lock an AWS session before selecting an EC2 region")
		}
		session.SelectedEC2Region = request.Region
		session.SelectedEC2InstanceID = ""
		if err := s.store.SaveSession(ctx, session); err != nil {
			return nil, err
		}
		return s.buildWorkspaceSnapshot(snapshot, session), s.notifyStateAndLog(
			ctx,
			snapshot,
			session,
			notifier,
			"info",
			fmt.Sprintf("Selected EC2 region %s.", request.Region),
		)
	case "aws.ec2.selectInstance":
		var request struct {
			InstanceID string `json:"instanceId"`
		}
		if err := json.Unmarshal(params, &request); err != nil {
			return nil, err
		}
		s.mu.Lock()
		defer s.mu.Unlock()
		snapshot, session, err := s.currentState(ctx)
		if err != nil {
			return nil, err
		}
		if !session.IsLocked || session.CurrentProviderID != "aws" {
			return nil, errors.New("lock an AWS session before selecting an EC2 instance")
		}
		session.SelectedEC2InstanceID = request.InstanceID
		if err := s.store.SaveSession(ctx, session); err != nil {
			return nil, err
		}
		return s.buildWorkspaceSnapshot(snapshot, session), nil
	case "aws.ec2.invokeAction":
		var request struct {
			Action     string `json:"action"`
			InstanceID string `json:"instanceId"`
		}
		if err := json.Unmarshal(params, &request); err != nil {
			return nil, err
		}
		s.mu.Lock()
		snapshot, session, err := s.currentState(ctx)
		if err != nil {
			s.mu.Unlock()
			return nil, err
		}
		profile, region, instanceID, err := s.activeEC2Selection(snapshot, session, request.InstanceID)
		if err != nil {
			s.mu.Unlock()
			return nil, err
		}
		if !profileAllowsAWSWrites(profile) {
			s.mu.Unlock()
			return nil, errors.New("EC2 write actions require a selected AWS profile with local endpoint_url and cloudsprocket_allow_writes = true")
		}
		s.mu.Unlock()

		job := models.JobStatus{
			JobID:   fmt.Sprintf("job-%d", s.now().UnixNano()),
			Label:   "EC2 Action",
			Status:  "queued",
			Message: fmt.Sprintf("Queueing EC2 %s for %s in %s.", request.Action, instanceID, region),
		}
		entry, err := s.store.AppendLog(ctx, "info", job.Message, "", s.timestamp())
		if err != nil {
			return nil, err
		}
		if notifier != nil {
			if err := notifier.Notify("log.appended", entry); err != nil {
				return nil, err
			}
		}
		go s.runEC2Action(job, notifier, snapshot, session, profile, region, instanceID, request.Action)
		return job, nil
	case "session.selectProvider":
		var request struct {
			ProviderID string `json:"providerId"`
		}
		if err := json.Unmarshal(params, &request); err != nil {
			return nil, err
		}
		s.mu.Lock()
		defer s.mu.Unlock()
		snapshot, session, err := s.currentState(ctx)
		if err != nil {
			return nil, err
		}
		session.IsLocked = false
		session.CurrentProviderID = request.ProviderID
		session.SelectedProfileID = ""
		session.SelectedAuthMethod = ""
		session.SelectedS3BucketName = ""
		session.SelectedS3ObjectKey = ""
		session.S3PrefixFilter = ""
		session.SelectedEC2Region = ""
		session.SelectedEC2InstanceID = ""
		session = reconcileSession(session, snapshot)
		if err := s.store.SaveSession(ctx, session); err != nil {
			return nil, err
		}
		return session, s.notifyStateAndLog(ctx, snapshot, session, notifier, "info", fmt.Sprintf("Selected provider %s.", request.ProviderID))
	case "session.selectProfile":
		var request struct {
			ProviderID string `json:"providerId"`
			ProfileID  string `json:"profileId"`
		}
		if err := json.Unmarshal(params, &request); err != nil {
			return nil, err
		}
		s.mu.Lock()
		defer s.mu.Unlock()
		snapshot, session, err := s.currentState(ctx)
		if err != nil {
			return nil, err
		}
		session.IsLocked = false
		session.CurrentProviderID = request.ProviderID
		session.SelectedProfileID = request.ProfileID
		session.SelectedAuthMethod = ""
		session.SelectedS3BucketName = ""
		session.SelectedS3ObjectKey = ""
		session.S3PrefixFilter = ""
		session.SelectedEC2Region = ""
		session.SelectedEC2InstanceID = ""
		session = reconcileSession(session, snapshot)
		if err := s.store.SaveSession(ctx, session); err != nil {
			return nil, err
		}
		return session, s.notifyStateAndLog(ctx, snapshot, session, notifier, "info", fmt.Sprintf("Selected profile %s.", request.ProfileID))
	case "session.selectAuthMethod":
		var request struct {
			AuthMethod models.AuthMethod `json:"authMethod"`
		}
		if err := json.Unmarshal(params, &request); err != nil {
			return nil, err
		}
		s.mu.Lock()
		defer s.mu.Unlock()
		snapshot, session, err := s.currentState(ctx)
		if err != nil {
			return nil, err
		}
		if !authMethodAvailable(session.AvailableAuthMethods, request.AuthMethod) {
			return nil, fmt.Errorf("auth method %s is not available", request.AuthMethod)
		}
		session.SelectedAuthMethod = request.AuthMethod
		if err := s.store.SaveSession(ctx, session); err != nil {
			return nil, err
		}
		return session, s.notifyStateAndLog(ctx, snapshot, session, notifier, "info", fmt.Sprintf("Selected auth method %s.", request.AuthMethod))
	case "session.lock":
		s.mu.Lock()
		defer s.mu.Unlock()
		snapshot, session, err := s.currentState(ctx)
		if err != nil {
			return nil, err
		}
		if session.CurrentProviderID == "" || session.SelectedProfileID == "" || session.SelectedAuthMethod == "" {
			return nil, errors.New("select a provider, profile, and auth method before locking the session")
		}
		if !authMethodAvailable(session.AvailableAuthMethods, session.SelectedAuthMethod) {
			return nil, errors.New("the selected auth method is not available for the active profile")
		}
		session.IsLocked = true
		session.LockedProviderID = session.CurrentProviderID
		session.LockedProfileID = session.SelectedProfileID
		session.LockedAuthMethod = session.SelectedAuthMethod
		session = reconcileSession(session, snapshot)
		if err := s.store.SaveSession(ctx, session); err != nil {
			return nil, err
		}
		return session, s.notifyStateAndLog(ctx, snapshot, session, notifier, "success", fmt.Sprintf("Locked %s session for %s.", session.LockedProviderID, session.LockedProfileID))
	case "session.unlock":
		s.mu.Lock()
		defer s.mu.Unlock()
		snapshot, session, err := s.currentState(ctx)
		if err != nil {
			return nil, err
		}
		session.IsLocked = false
		session = reconcileSession(session, snapshot)
		if err := s.store.SaveSession(ctx, session); err != nil {
			return nil, err
		}
		return session, s.notifyStateAndLog(ctx, snapshot, session, notifier, "info", "Unlocked the active cloud session.")
	case "logs.list":
		var request struct {
			Limit int `json:"limit"`
		}
		_ = json.Unmarshal(params, &request)
		return s.store.ListLogs(ctx, request.Limit)
	case "app.settings.get":
		return s.settingsSnapshot(), nil
	case "actions.invoke":
		var request struct {
			ActionID string `json:"actionId"`
		}
		if err := json.Unmarshal(params, &request); err != nil {
			return nil, err
		}
		if request.ActionID != "refresh" {
			return nil, fmt.Errorf("action %s is not implemented yet", request.ActionID)
		}
		job := models.JobStatus{
			JobID:   fmt.Sprintf("job-%d", s.now().UnixNano()),
			Label:   "Refresh Discovery",
			Status:  "queued",
			Message: "Refreshing provider discovery and session state.",
		}
		go s.runRefresh(job, notifier)
		return job, nil
	default:
		return nil, fmt.Errorf("unknown backend method: %s", method)
	}
}

func (s *Service) currentState(ctx context.Context) (discovery.Snapshot, models.SessionSnapshot, error) {
	snapshot, err := s.discovery.Discover()
	if err != nil {
		return discovery.Snapshot{}, models.SessionSnapshot{}, err
	}

	stored, ok, err := s.store.LoadSession(ctx)
	if err != nil {
		return discovery.Snapshot{}, models.SessionSnapshot{}, err
	}
	if !ok {
		stored = models.SessionSnapshot{}
	}

	session := reconcileSession(stored, snapshot)
	if err := s.store.SaveSession(ctx, session); err != nil {
		return discovery.Snapshot{}, models.SessionSnapshot{}, err
	}
	return snapshot, session, nil
}

func (s *Service) runRefresh(job models.JobStatus, notifier Notifier) {
	background := context.Background()
	if notifier != nil {
		_ = notifier.Notify("job.updated", models.JobStatus{
			JobID:   job.JobID,
			Label:   job.Label,
			Status:  "running",
			Message: "Refreshing provider discovery.",
		})
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	snapshot, session, err := s.currentState(background)
	if err != nil {
		if notifier != nil {
			_ = notifier.Notify("job.updated", models.JobStatus{
				JobID:   job.JobID,
				Label:   job.Label,
				Status:  "failed",
				Message: err.Error(),
			})
		}
		return
	}

	if err := s.notifyStateAndLog(background, snapshot, session, notifier, "success", "Discovery refresh completed."); err != nil {
		if notifier != nil {
			_ = notifier.Notify("job.updated", models.JobStatus{
				JobID:   job.JobID,
				Label:   job.Label,
				Status:  "failed",
				Message: err.Error(),
			})
		}
		return
	}

	if notifier != nil {
		_ = notifier.Notify("job.updated", models.JobStatus{
			JobID:       job.JobID,
			Label:       job.Label,
			Status:      "completed",
			Message:     "Refresh completed.",
			CompletedAt: s.timestamp(),
		})
	}
}

func (s *Service) runS3Upload(
	job models.JobStatus,
	notifier Notifier,
	snapshot discovery.Snapshot,
	session models.SessionSnapshot,
	profile models.ProfileSummary,
	bucketName string,
	objectKey string,
	sourcePath string,
	prefix string,
) {
	background := context.Background()
	s.notifyJob(notifier, models.JobStatus{
		JobID:   job.JobID,
		Label:   job.Label,
		Status:  "running",
		Message: fmt.Sprintf("Uploading %s to s3://%s/%s.", sourcePath, bucketName, objectKey),
	})

	result, err := s.s3.UploadFile(background, profile, bucketName, objectKey, sourcePath)
	if err != nil {
		s.notifyJob(notifier, models.JobStatus{
			JobID:   job.JobID,
			Label:   job.Label,
			Status:  "failed",
			Message: fmt.Sprintf("S3 upload failed: %v", err),
		})
		return
	}

	s.mu.Lock()
	if prefix == "" || strings.HasPrefix(objectKey, prefix) {
		session.SelectedS3ObjectKey = objectKey
	}
	if saveErr := s.store.SaveSession(background, session); saveErr != nil {
		s.mu.Unlock()
		s.notifyJob(notifier, models.JobStatus{
			JobID:   job.JobID,
			Label:   job.Label,
			Status:  "failed",
			Message: fmt.Sprintf("S3 upload completed, but session state could not be saved: %v", saveErr),
		})
		return
	}
	err = s.notifyStateAndLog(
		background,
		snapshot,
		session,
		notifier,
		"success",
		fmt.Sprintf("Uploaded %s to %s.", objectKey, result.DestinationURI),
	)
	s.mu.Unlock()
	if err != nil {
		s.notifyJob(notifier, models.JobStatus{
			JobID:   job.JobID,
			Label:   job.Label,
			Status:  "failed",
			Message: err.Error(),
		})
		return
	}

	message := fmt.Sprintf("Uploaded %s to %s.", objectKey, result.DestinationURI)
	if prefix != "" && !strings.HasPrefix(objectKey, prefix) {
		message += " The current prefix filter hides the uploaded object."
	}
	s.notifyJob(notifier, models.JobStatus{
		JobID:       job.JobID,
		Label:       job.Label,
		Status:      "completed",
		Message:     message,
		CompletedAt: s.timestamp(),
		Result:      result,
	})
}

func (s *Service) runS3Presign(
	job models.JobStatus,
	notifier Notifier,
	profile models.ProfileSummary,
	bucketName string,
	objectKey string,
	durationSeconds int,
) {
	background := context.Background()
	s.notifyJob(notifier, models.JobStatus{
		JobID:   job.JobID,
		Label:   job.Label,
		Status:  "running",
		Message: fmt.Sprintf("Generating a signed URL for %s.", objectKey),
	})

	result, err := s.s3.PresignGetObject(background, profile, bucketName, objectKey, durationSeconds)
	if err != nil {
		s.notifyJob(notifier, models.JobStatus{
			JobID:   job.JobID,
			Label:   job.Label,
			Status:  "failed",
			Message: fmt.Sprintf("Signed URL generation failed: %v", err),
		})
		return
	}

	s.notifyJob(notifier, models.JobStatus{
		JobID:       job.JobID,
		Label:       job.Label,
		Status:      "completed",
		Message:     fmt.Sprintf("Generated a signed URL for %s.", objectKey),
		CompletedAt: s.timestamp(),
		Result:      result,
	})
}

func (s *Service) runURLValidation(job models.JobStatus, notifier Notifier, rawURL string) {
	s.notifyJob(notifier, models.JobStatus{
		JobID:   job.JobID,
		Label:   job.Label,
		Status:  "running",
		Message: "Validating the pasted URL.",
	})

	result := urlinspector.ValidateURL(nil, rawURL)
	status := "completed"
	if !result.Succeeded {
		status = "failed"
	}
	s.notifyJob(notifier, models.JobStatus{
		JobID:       job.JobID,
		Label:       job.Label,
		Status:      status,
		Message:     result.Summary,
		CompletedAt: s.timestamp(),
		Result:      result,
	})
}

func (s *Service) runEC2Action(
	job models.JobStatus,
	notifier Notifier,
	snapshot discovery.Snapshot,
	session models.SessionSnapshot,
	profile models.ProfileSummary,
	region string,
	instanceID string,
	action string,
) {
	background := context.Background()
	normalisedAction := strings.ToLower(strings.TrimSpace(action))
	runningMessage := fmt.Sprintf("Running EC2 %s for %s in %s.", normalisedAction, instanceID, region)
	_ = s.appendActivity(background, notifier, "info", runningMessage)
	s.notifyJob(notifier, models.JobStatus{
		JobID:   job.JobID,
		Label:   job.Label,
		Status:  "running",
		Message: runningMessage,
	})

	var err error
	switch normalisedAction {
	case "start":
		err = s.ec2.StartInstance(background, profile, region, instanceID)
	case "stop":
		err = s.ec2.StopInstance(background, profile, region, instanceID)
	case "reboot":
		err = s.ec2.RebootInstance(background, profile, region, instanceID)
	default:
		err = fmt.Errorf("EC2 action %q is not implemented", action)
	}
	if err != nil {
		failureMessage := fmt.Sprintf("EC2 %s failed for %s: %v", normalisedAction, instanceID, err)
		_ = s.appendActivity(background, notifier, "error", failureMessage)
		s.notifyJob(notifier, models.JobStatus{
			JobID:   job.JobID,
			Label:   job.Label,
			Status:  "failed",
			Message: failureMessage,
		})
		return
	}

	session.SelectedEC2Region = region
	session.SelectedEC2InstanceID = instanceID
	s.mu.Lock()
	if saveErr := s.store.SaveSession(background, session); saveErr != nil {
		s.mu.Unlock()
		s.notifyJob(notifier, models.JobStatus{
			JobID:   job.JobID,
			Label:   job.Label,
			Status:  "failed",
			Message: fmt.Sprintf("EC2 %s completed, but session state could not be saved: %v", normalisedAction, saveErr),
		})
		return
	}
	s.mu.Unlock()

	instances := s.waitForEC2ActionState(background, notifier, job, profile, region, instanceID, normalisedAction)
	finalState := selectedEC2State(instances, instanceID)
	successMessage := fmt.Sprintf("EC2 %s completed for %s in %s.", normalisedAction, instanceID, region)
	if finalState != "" {
		desiredState := ec2DesiredState(normalisedAction)
		if desiredState != "" && finalState == desiredState {
			successMessage = fmt.Sprintf("%s Desired state reached: %s.", successMessage, finalState)
		} else {
			successMessage = fmt.Sprintf("%s Latest observed state: %s.", successMessage, finalState)
		}
	}

	s.mu.Lock()
	workspace := s.buildWorkspaceSnapshot(snapshot, session)
	workspace.EC2Instances = instances
	workspace.SelectedEC2Region = region
	workspace.SelectedEC2InstanceID = instanceID
	err = s.notifyStateAndLog(background, snapshot, session, notifier, "success", successMessage)
	s.mu.Unlock()
	if err != nil {
		s.notifyJob(notifier, models.JobStatus{
			JobID:   job.JobID,
			Label:   job.Label,
			Status:  "failed",
			Message: err.Error(),
		})
		return
	}

	s.notifyJob(notifier, models.JobStatus{
		JobID:       job.JobID,
		Label:       job.Label,
		Status:      "completed",
		Message:     successMessage,
		CompletedAt: s.timestamp(),
		Result:      workspace,
	})
}

func (s *Service) waitForEC2ActionState(
	ctx context.Context,
	notifier Notifier,
	job models.JobStatus,
	profile models.ProfileSummary,
	region string,
	instanceID string,
	action string,
) []models.AwsEc2Instance {
	desiredState := ec2DesiredState(action)
	deadline := time.Now().Add(30 * time.Second)
	var instances []models.AwsEc2Instance
	for attempt := 1; ; attempt++ {
		instances = s.ec2Instances(ctx, profile, region)
		currentState := selectedEC2State(instances, instanceID)
		if desiredState == "" || currentState == desiredState || time.Now().After(deadline) {
			return instances
		}
		s.notifyJob(notifier, models.JobStatus{
			JobID:   job.JobID,
			Label:   job.Label,
			Status:  "running",
			Message: fmt.Sprintf("Waiting for EC2 %s to reach %s. Current state: %s.", instanceID, desiredState, firstNonEmpty(currentState, "unknown")),
		})
		if attempt >= 15 {
			return instances
		}
		time.Sleep(2 * time.Second)
	}
}

func ec2DesiredState(action string) string {
	switch action {
	case "start", "reboot":
		return "running"
	case "stop":
		return "stopped"
	default:
		return ""
	}
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return value
		}
	}
	return ""
}

func (s *Service) appendActivity(ctx context.Context, notifier Notifier, level string, message string) error {
	entry, err := s.store.AppendLog(ctx, level, message, "", s.timestamp())
	if err != nil {
		return err
	}
	if notifier != nil {
		if err := notifier.Notify("log.appended", entry); err != nil {
			return err
		}
	}
	return nil
}

func (s *Service) notifyJob(notifier Notifier, job models.JobStatus) {
	if notifier != nil {
		_ = notifier.Notify("job.updated", job)
	}
}

func (s *Service) notifyStateAndLog(
	ctx context.Context,
	snapshot discovery.Snapshot,
	session models.SessionSnapshot,
	notifier Notifier,
	level string,
	message string,
) error {
	entry, err := s.store.AppendLog(ctx, level, message, "", s.timestamp())
	if err != nil {
		return err
	}

	if notifier != nil {
		if err := notifier.Notify("state.changed", statePayload(snapshot, session)); err != nil {
			return err
		}
		if err := notifier.Notify("log.appended", entry); err != nil {
			return err
		}
	}

	return nil
}

func (s *Service) timestamp() string {
	return s.now().UTC().Format(time.RFC3339)
}

func (s *Service) settingsSnapshot() models.AppSettingsSnapshot {
	return models.AppSettingsSnapshot{
		PlatformName: s.settings.PlatformName,
		ConfigDir:    s.settings.ConfigDir,
		DatabasePath: s.settings.DatabasePath,
		LogPath:      s.settings.LogPath,
	}
}

func (s *Service) buildWorkspaceSnapshot(
	snapshot discovery.Snapshot,
	session models.SessionSnapshot,
) models.WorkspaceSnapshot {
	workspace := models.WorkspaceSnapshot{
		AuthMethod:       session.SelectedAuthMethod,
		RuntimeSettings:  s.settingsSnapshot(),
		S3PrefixFilter:   session.S3PrefixFilter,
		S3Buckets:        []models.AwsS3Bucket{},
		S3Objects:        []models.AwsS3Object{},
		S3ObjectMetadata: []models.DetailField{},
		EC2Regions:       []string{},
		EC2Instances:     []models.AwsEc2Instance{},
	}

	if provider, ok := findProvider(snapshot.Providers, session.CurrentProviderID); ok {
		workspace.Provider = &provider
	}

	profiles := filterProfiles(snapshot.Profiles, session.CurrentProviderID)
	if profile, ok := findProfile(profiles, session.SelectedProfileID); ok {
		workspace.Profile = &profile
		workspace.AWSEndpointURL = profileEndpointURL(profile)
		workspace.AWSWritesEnabled = profileAllowsAWSWrites(profile)
	}

	if workspace.Provider != nil &&
		workspace.Provider.ProviderID == "aws" &&
		workspace.Profile != nil &&
		s.s3 != nil {
		workspace.S3Buckets = s.s3Buckets(context.Background(), *workspace.Profile)
		workspace.SelectedS3BucketName = s.selectedS3BucketName(session, workspace.S3Buckets)
		workspace.S3Objects = s.s3Objects(
			context.Background(),
			*workspace.Profile,
			workspace.SelectedS3BucketName,
			session.S3PrefixFilter,
		)
		workspace.SelectedS3ObjectKey = s.selectedS3ObjectKey(session, workspace.S3Objects)
		workspace.S3ObjectMetadata = s.s3ObjectMetadata(
			context.Background(),
			*workspace.Profile,
			workspace.SelectedS3BucketName,
			workspace.SelectedS3ObjectKey,
		)
		workspace.S3ExportSnippets = s.s3ExportSnippets(
			workspace.SelectedS3BucketName,
			workspace.SelectedS3ObjectKey,
		)
		if workspace.SelectedS3BucketName == "" {
			workspace.S3StatusMessage = "No buckets are currently available for this locked AWS session."
		} else if len(workspace.S3Objects) == 0 {
			if session.S3PrefixFilter != "" {
				workspace.S3StatusMessage = fmt.Sprintf(
					"No objects matched prefix %q in %s.",
					session.S3PrefixFilter,
					workspace.SelectedS3BucketName,
				)
			} else {
				workspace.S3StatusMessage = fmt.Sprintf("No objects were returned for %s.", workspace.SelectedS3BucketName)
			}
		} else {
			workspace.S3StatusMessage = fmt.Sprintf(
				"Loaded %d objects from %s.",
				len(workspace.S3Objects),
				workspace.SelectedS3BucketName,
			)
		}
	}

	if workspace.Provider != nil &&
		workspace.Provider.ProviderID == "aws" &&
		workspace.Profile != nil &&
		s.ec2 != nil {
		workspace.EC2Regions = s.ec2Regions(context.Background(), *workspace.Profile)
		workspace.SelectedEC2Region = s.selectedEC2Region(session, workspace.EC2Regions, *workspace.Profile)
		workspace.EC2Instances = s.ec2Instances(context.Background(), *workspace.Profile, workspace.SelectedEC2Region)
		workspace.SelectedEC2InstanceID = s.selectedEC2InstanceID(session, workspace.EC2Instances)
		if workspace.SelectedEC2Region == "" {
			workspace.EC2StatusMessage = "No EC2 region is available for this locked AWS session."
		} else if len(workspace.EC2Instances) == 0 {
			workspace.EC2StatusMessage = fmt.Sprintf("No EC2 instances were returned for %s.", workspace.SelectedEC2Region)
		} else {
			workspace.EC2StatusMessage = fmt.Sprintf(
				"Loaded %d EC2 instances from %s.",
				len(workspace.EC2Instances),
				workspace.SelectedEC2Region,
			)
		}
	}

	return workspace
}

func (s *Service) activeS3Selection(
	snapshot discovery.Snapshot,
	session models.SessionSnapshot,
	requireBucket bool,
) (models.ProfileSummary, string, error) {
	if !session.IsLocked || session.CurrentProviderID != "aws" {
		return models.ProfileSummary{}, "", errors.New("lock an AWS session before using S3 actions")
	}
	profile, ok := findProfile(filterProfiles(snapshot.Profiles, session.CurrentProviderID), session.SelectedProfileID)
	if !ok {
		return models.ProfileSummary{}, "", errors.New("the locked AWS profile is not available")
	}
	bucketName := session.SelectedS3BucketName
	if bucketName == "" && requireBucket {
		bucketName = s.selectedS3BucketName(session, s.s3Buckets(context.Background(), profile))
	}
	if requireBucket && bucketName == "" {
		return models.ProfileSummary{}, "", errors.New("select an S3 bucket before using this action")
	}
	return profile, bucketName, nil
}

func (s *Service) selectedS3BucketName(
	session models.SessionSnapshot,
	buckets []models.AwsS3Bucket,
) string {
	if session.SelectedS3BucketName != "" {
		for _, bucket := range buckets {
			if bucket.Name == session.SelectedS3BucketName {
				return session.SelectedS3BucketName
			}
		}
	}
	if len(buckets) == 0 {
		return ""
	}
	return buckets[0].Name
}

func (s *Service) selectedS3ObjectKey(
	session models.SessionSnapshot,
	objects []models.AwsS3Object,
) string {
	if session.SelectedS3ObjectKey != "" {
		for _, object := range objects {
			if object.Key == session.SelectedS3ObjectKey {
				return session.SelectedS3ObjectKey
			}
		}
	}
	if len(objects) == 0 {
		return ""
	}
	return objects[0].Key
}

func (s *Service) s3Buckets(
	ctx context.Context,
	profile models.ProfileSummary,
) []models.AwsS3Bucket {
	const scope = "aws.s3.buckets"

	queryHash := profile.ProfileID
	buckets, err := s.s3.ListBuckets(ctx, profile)
	if err == nil {
		fetchedAt := s.timestamp()
		if saveErr := s.store.SaveResourceCache(ctx, scope, queryHash, buckets, fetchedAt); saveErr == nil {
			for index := range buckets {
				if buckets[index].Summary == "" {
					buckets[index].Summary = "Fetched " + fetchedAt
				}
			}
		}
		return buckets
	}

	var cached []models.AwsS3Bucket
	fetchedAt, ok, cacheErr := s.store.LoadResourceCache(ctx, scope, queryHash, &cached)
	if cacheErr == nil && ok {
		for index := range cached {
			if cached[index].Summary == "" {
				cached[index].Summary = "Cached " + fetchedAt
			}
		}
		return cached
	}

	return []models.AwsS3Bucket{}
}

func (s *Service) s3Objects(
	ctx context.Context,
	profile models.ProfileSummary,
	bucketName string,
	prefix string,
) []models.AwsS3Object {
	if bucketName == "" {
		return []models.AwsS3Object{}
	}

	const scope = "aws.s3.objects"
	queryHash := profile.ProfileID + "|" + bucketName + "|" + prefix
	objects, err := s.s3.ListObjects(ctx, profile, bucketName, prefix)
	if err == nil {
		_ = s.store.SaveResourceCache(ctx, scope, queryHash, objects, s.timestamp())
		return objects
	}

	var cached []models.AwsS3Object
	_, ok, cacheErr := s.store.LoadResourceCache(ctx, scope, queryHash, &cached)
	if cacheErr == nil && ok {
		return cached
	}

	return []models.AwsS3Object{}
}

func (s *Service) s3ObjectMetadata(
	ctx context.Context,
	profile models.ProfileSummary,
	bucketName string,
	objectKey string,
) []models.DetailField {
	if bucketName == "" || objectKey == "" {
		return []models.DetailField{}
	}

	const scope = "aws.s3.object-metadata"
	queryHash := profile.ProfileID + "|" + bucketName + "|" + objectKey
	fields, err := s.s3.HeadObject(ctx, profile, bucketName, objectKey)
	if err == nil {
		_ = s.store.SaveResourceCache(ctx, scope, queryHash, fields, s.timestamp())
		return fields
	}

	var cached []models.DetailField
	_, ok, cacheErr := s.store.LoadResourceCache(ctx, scope, queryHash, &cached)
	if cacheErr == nil && ok {
		return cached
	}

	return []models.DetailField{}
}

func (s *Service) s3ExportSnippets(bucketName string, objectKey string) []models.AwsS3ExportSnippet {
	if bucketName == "" || objectKey == "" {
		return []models.AwsS3ExportSnippet{}
	}
	s3URI := fmt.Sprintf("s3://%s/%s", bucketName, objectKey)
	return []models.AwsS3ExportSnippet{
		{
			Label: "S3 URI",
			Value: s3URI,
		},
		{
			Label: "AWS CLI copy command",
			Value: fmt.Sprintf("aws s3 cp %q .", s3URI),
		},
		{
			Label: "AWS CLI presign command",
			Value: fmt.Sprintf("aws s3 presign %q --expires-in 3600", s3URI),
		},
	}
}

func (s *Service) activeEC2Selection(
	snapshot discovery.Snapshot,
	session models.SessionSnapshot,
	instanceIDOverride string,
) (models.ProfileSummary, string, string, error) {
	if !session.IsLocked || session.CurrentProviderID != "aws" {
		return models.ProfileSummary{}, "", "", errors.New("lock an AWS session before using EC2 actions")
	}
	profile, ok := findProfile(filterProfiles(snapshot.Profiles, session.CurrentProviderID), session.SelectedProfileID)
	if !ok {
		return models.ProfileSummary{}, "", "", errors.New("the locked AWS profile is not available")
	}
	regions := s.ec2Regions(context.Background(), profile)
	region := s.selectedEC2Region(session, regions, profile)
	if region == "" {
		return models.ProfileSummary{}, "", "", errors.New("select an EC2 region before using this action")
	}
	instanceID := strings.TrimSpace(instanceIDOverride)
	if instanceID == "" {
		instanceID = session.SelectedEC2InstanceID
	}
	if instanceID == "" {
		instanceID = s.selectedEC2InstanceID(session, s.ec2Instances(context.Background(), profile, region))
	}
	if instanceID == "" {
		return models.ProfileSummary{}, "", "", errors.New("select an EC2 instance before using this action")
	}
	return profile, region, instanceID, nil
}

func (s *Service) ec2Regions(ctx context.Context, profile models.ProfileSummary) []string {
	const scope = "aws.ec2.regions"
	queryHash := profile.ProfileID
	regions, err := s.ec2.ListRegions(ctx, profile)
	if err == nil && len(regions) > 0 {
		_ = s.store.SaveResourceCache(ctx, scope, queryHash, regions, s.timestamp())
		return regions
	}

	var cached []string
	_, ok, cacheErr := s.store.LoadResourceCache(ctx, scope, queryHash, &cached)
	if cacheErr == nil && ok && len(cached) > 0 {
		return cached
	}

	if hint := profileRegionHint(profile); hint != "" {
		return []string{hint}
	}
	return []string{}
}

func (s *Service) selectedEC2Region(
	session models.SessionSnapshot,
	regions []string,
	profile models.ProfileSummary,
) string {
	if session.SelectedEC2Region != "" {
		for _, region := range regions {
			if region == session.SelectedEC2Region {
				return session.SelectedEC2Region
			}
		}
	}
	hint := profileRegionHint(profile)
	for _, region := range regions {
		if region == hint {
			return hint
		}
	}
	if len(regions) == 0 {
		return ""
	}
	return regions[0]
}

func (s *Service) ec2Instances(
	ctx context.Context,
	profile models.ProfileSummary,
	region string,
) []models.AwsEc2Instance {
	if region == "" {
		return []models.AwsEc2Instance{}
	}

	const scope = "aws.ec2.instances"
	queryHash := profile.ProfileID + "|" + region
	instances, err := s.ec2.ListInstances(ctx, profile, region)
	if err == nil {
		_ = s.store.SaveResourceCache(ctx, scope, queryHash, instances, s.timestamp())
		return instances
	}

	var cached []models.AwsEc2Instance
	_, ok, cacheErr := s.store.LoadResourceCache(ctx, scope, queryHash, &cached)
	if cacheErr == nil && ok {
		return cached
	}

	return []models.AwsEc2Instance{}
}

func (s *Service) selectedEC2InstanceID(
	session models.SessionSnapshot,
	instances []models.AwsEc2Instance,
) string {
	if session.SelectedEC2InstanceID != "" {
		for _, instance := range instances {
			if instance.InstanceID == session.SelectedEC2InstanceID {
				return session.SelectedEC2InstanceID
			}
		}
	}
	if len(instances) == 0 {
		return ""
	}
	return instances[0].InstanceID
}

func selectedEC2State(instances []models.AwsEc2Instance, instanceID string) string {
	for _, instance := range instances {
		if instance.InstanceID == instanceID {
			return instance.State
		}
	}
	return ""
}

func profileRegionHint(profile models.ProfileSummary) string {
	for _, field := range profile.Attributes {
		if field.Label == "Region" && field.Value != "" {
			return field.Value
		}
	}
	return "us-east-1"
}

func profileEndpointURL(profile models.ProfileSummary) string {
	for _, field := range profile.Attributes {
		if normaliseProfileFieldLabel(field.Label) == "endpointurl" {
			return strings.TrimSpace(field.Value)
		}
	}
	return ""
}

func profileAllowsAWSWrites(profile models.ProfileSummary) bool {
	if !profileAllowsWriteOptIn(profile) {
		return false
	}
	endpointURL := profileEndpointURL(profile)
	if endpointURL == "" {
		return false
	}
	parsed, err := url.Parse(endpointURL)
	if err != nil {
		return false
	}
	host := parsed.Hostname()
	if strings.Contains(strings.ToLower(host), "localstack") || host == "localhost" {
		return true
	}
	ip := net.ParseIP(host)
	return ip != nil && ip.IsPrivate()
}

func profileAllowsWriteOptIn(profile models.ProfileSummary) bool {
	for _, field := range profile.Attributes {
		if normaliseProfileFieldLabel(field.Label) == "cloudsprocketallowwrites" {
			value := strings.ToLower(strings.TrimSpace(field.Value))
			return value == "1" || value == "true" || value == "yes"
		}
	}
	return false
}

func normaliseProfileFieldLabel(label string) string {
	replacer := strings.NewReplacer(" ", "", "_", "", "-", "")
	return strings.ToLower(replacer.Replace(label))
}

func statePayload(snapshot discovery.Snapshot, session models.SessionSnapshot) models.StateChangedPayload {
	return models.StateChangedPayload{
		Providers: snapshot.Providers,
		Profiles:  filterProfiles(snapshot.Profiles, session.CurrentProviderID),
		Session:   session,
	}
}

func reconcileSession(session models.SessionSnapshot, snapshot discovery.Snapshot) models.SessionSnapshot {
	if session.IsLocked {
		session.CurrentProviderID = session.LockedProviderID
		session.SelectedProfileID = session.LockedProfileID
		session.SelectedAuthMethod = session.LockedAuthMethod
	}

	if session.CurrentProviderID == "" || !providerExists(snapshot.Providers, session.CurrentProviderID) {
		if len(snapshot.Providers) > 0 {
			session.CurrentProviderID = snapshot.Providers[0].ProviderID
		}
	}

	profiles := filterProfiles(snapshot.Profiles, session.CurrentProviderID)
	if len(profiles) == 0 {
		return clearLockState(session)
	}

	if session.SelectedProfileID == "" || !profileExists(profiles, session.SelectedProfileID) {
		session.SelectedProfileID = profiles[0].ProfileID
	}

	currentProfile, ok := findProfile(profiles, session.SelectedProfileID)
	if !ok {
		return clearLockState(session)
	}

	session.AvailableAuthMethods = append([]models.AuthMethodStatus(nil), currentProfile.AuthMethods...)
	if session.SelectedAuthMethod == "" || !authMethodAvailable(session.AvailableAuthMethods, session.SelectedAuthMethod) {
		session.SelectedAuthMethod = firstAvailableAuthMethod(session.AvailableAuthMethods)
	}

	if session.IsLocked {
		if session.LockedProviderID != session.CurrentProviderID || session.LockedProfileID != session.SelectedProfileID || session.LockedAuthMethod != session.SelectedAuthMethod {
			return clearLockState(session)
		}
		session.WorkspaceTabs = workspaceTabs()
		return session
	}

	return clearLockState(session)
}

func clearLockState(session models.SessionSnapshot) models.SessionSnapshot {
	session.IsLocked = false
	session.LockedProviderID = ""
	session.LockedProfileID = ""
	session.LockedAuthMethod = ""
	session.SelectedS3BucketName = ""
	session.SelectedS3ObjectKey = ""
	session.S3PrefixFilter = ""
	session.SelectedEC2Region = ""
	session.SelectedEC2InstanceID = ""
	session.AvailableAuthMethods = append([]models.AuthMethodStatus(nil), session.AvailableAuthMethods...)
	if session.SelectedProfileID == "" {
		session.SelectedAuthMethod = ""
		session.AvailableAuthMethods = []models.AuthMethodStatus{}
	}
	session.WorkspaceTabs = []models.WorkspaceTab{}
	return session
}

func workspaceTabs() []models.WorkspaceTab {
	return []models.WorkspaceTab{
		{
			TabID:   "overview",
			Label:   "Overview",
			Summary: "Session-wide provider context and health.",
			Detail:  "Shows the locked cloud context and recent operator activity.",
		},
		{
			TabID:   "s3",
			Label:   "S3",
			Summary: "Bucket and object workbench.",
			Detail:  "Presigned URLs, uploads, validation, and bucket browsing are being ported.",
		},
		{
			TabID:   "ec2",
			Label:   "EC2",
			Summary: "Fleet and instance operations.",
			Detail:  "Instance inventory and lifecycle actions are being ported.",
		},
		{
			TabID:   "actions",
			Label:   "Actions",
			Summary: "Cross-provider command actions.",
			Detail:  "Provider actions remain visible while the rewrite reaches parity.",
		},
	}
}

func filterProfiles(profiles []models.ProfileSummary, providerID string) []models.ProfileSummary {
	if providerID == "" {
		return append([]models.ProfileSummary(nil), profiles...)
	}

	filtered := []models.ProfileSummary{}
	for _, profile := range profiles {
		if profile.ProviderID == providerID {
			filtered = append(filtered, profile)
		}
	}
	return filtered
}

func providerExists(providers []models.ProviderSummary, providerID string) bool {
	for _, provider := range providers {
		if provider.ProviderID == providerID {
			return true
		}
	}
	return false
}

func profileExists(profiles []models.ProfileSummary, profileID string) bool {
	_, ok := findProfile(profiles, profileID)
	return ok
}

func findProfile(profiles []models.ProfileSummary, profileID string) (models.ProfileSummary, bool) {
	for _, profile := range profiles {
		if profile.ProfileID == profileID {
			return profile, true
		}
	}
	return models.ProfileSummary{}, false
}

func findProvider(providers []models.ProviderSummary, providerID string) (models.ProviderSummary, bool) {
	for _, provider := range providers {
		if provider.ProviderID == providerID {
			return provider, true
		}
	}
	return models.ProviderSummary{}, false
}

func authMethodAvailable(methods []models.AuthMethodStatus, target models.AuthMethod) bool {
	for _, method := range methods {
		if method.Method == target && method.Available {
			return true
		}
	}
	return false
}

func firstAvailableAuthMethod(methods []models.AuthMethodStatus) models.AuthMethod {
	for _, method := range methods {
		if method.Available {
			return method.Method
		}
	}
	return ""
}

package app

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"cloudsprocket/backend/daemon/internal/config"
	"cloudsprocket/backend/daemon/internal/deploy"
	"cloudsprocket/backend/daemon/internal/discovery"
	"cloudsprocket/backend/daemon/internal/flociaz"
	"cloudsprocket/backend/daemon/internal/localstack"
	"cloudsprocket/backend/daemon/internal/models"
	"cloudsprocket/backend/daemon/internal/recipes"
	"cloudsprocket/backend/daemon/internal/secrets"
	"cloudsprocket/backend/daemon/internal/store"
	"cloudsprocket/backend/daemon/internal/tofu"
	"cloudsprocket/backend/daemon/internal/urlinspector"
)

const (
	// dockerProbeTimeout bounds Docker status, snapshot, and resource-listing
	// calls so an unreachable Docker engine fails fast instead of blocking the
	// request goroutine forever. The Docker host (named pipe or socket) can be
	// configured but unreachable when the engine is stopped, in which case the
	// underlying dial would otherwise wait indefinitely.
	dockerProbeTimeout = 3 * time.Second
	// defaultAzureInventoryTimeout bounds Azure inventory calls (floci-az ARM
	// pager / `az` CLI) so a stalled response cannot hang a workspace snapshot.
	// Generous enough for real Azure, but never unbounded.
	defaultAzureInventoryTimeout = 30 * time.Second
	// dockerLogsTimeout bounds container log retrieval, which can take slightly
	// longer than a status probe but must still never hang a request.
	dockerLogsTimeout = 8 * time.Second
	// dockerUnreachableCacheTTL caches an "engine unreachable" verdict so the
	// Local Runtime poll (every few seconds) does not pay the full probe timeout
	// on every fetch when Docker is stopped. A manual "Refresh Docker" forces a
	// fresh probe, so the staleness is bounded and user-overridable.
	dockerUnreachableCacheTTL = 15 * time.Second
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

type AzureInventory interface {
	ListResourceGroups(ctx context.Context, profile models.ProfileSummary) ([]models.AzureResourceGroup, error)
	ListVirtualMachines(ctx context.Context, profile models.ProfileSummary, resourceGroup string) ([]models.AzureVirtualMachine, error)
}

type DockerRuntime interface {
	Snapshot(ctx context.Context) (models.DockerRuntimeSnapshot, error)
	ListOwnedResources(ctx context.Context) ([]models.ManagedDockerResource, error)
}

type LocalStackManager interface {
	Status(ctx context.Context) (models.LocalStackStatus, error)
	Start(ctx context.Context, options models.LocalStackStartOptions) (models.LocalStackStatus, error)
	Stop(ctx context.Context) (models.LocalStackStatus, error)
	Logs(ctx context.Context, tail int) (models.EmulatorLogSnapshot, error)
	EnsureManagedProfile() error
}

type AzureRuntimeManager interface {
	Status(ctx context.Context) (models.LocalStackStatus, error)
	Start(ctx context.Context, options models.LocalStackStartOptions) (models.LocalStackStatus, error)
	Stop(ctx context.Context) (models.LocalStackStatus, error)
	Logs(ctx context.Context, tail int) (models.EmulatorLogSnapshot, error)
	EnsureManagedConfig() error
}

type Notifier interface {
	Notify(method string, payload any) error
}

// Deployer runs recipe deployments through the IaC engine. Implemented by
// *deploy.Engine; an interface so tests can inject a fake.
type Deployer interface {
	Available() bool
	Version(ctx context.Context) (string, error)
	BinaryPath() string
	Install(ctx context.Context) (string, error)
	Preflight(ctx context.Context, deployment *deploy.Deployment) error
	Prepare(deployment *deploy.Deployment) error
	Plan(ctx context.Context, deployment *deploy.Deployment, onLine tofu.LogFunc) (deploy.PlanSummary, error)
	Apply(ctx context.Context, deployment *deploy.Deployment, onLine tofu.LogFunc) ([]deploy.Output, error)
	Destroy(ctx context.Context, deployment *deploy.Deployment, onLine tofu.LogFunc) error
}

type Service struct {
	settings      config.Settings
	store         *store.Store
	discovery     *discovery.Service
	s3            S3Inventory
	ec2           EC2Inventory
	azure         AzureInventory
	docker        DockerRuntime
	localstackMgr LocalStackManager
	azureRuntime  AzureRuntimeManager
	recipes       *recipes.Loader
	deployer      Deployer
	// cipher seals sensitive deployment values at rest. Nil when no key could
	// be loaded, in which case values are persisted unsealed.
	cipher *secrets.Cipher
	// azureInventoryTimeout bounds Azure inventory calls (the floci-az ARM
	// pager and the `az` CLI) so a stalled response cannot hang a workspace
	// snapshot. Configurable so tests can use a short deadline.
	azureInventoryTimeout time.Duration
	// dockerSnapshot caches the last Docker runtime probe so a stopped engine
	// does not cost a full probe timeout on every Local Runtime poll.
	dockerSnapshotMu    sync.Mutex
	dockerSnapshotValue *models.DockerRuntimeSnapshot
	dockerSnapshotAt    time.Time
	now                 func() time.Time
	mu                  sync.Mutex
}

func New(
	settings config.Settings,
	store *store.Store,
	discoveryService *discovery.Service,
	s3Inventory S3Inventory,
	ec2Inventory EC2Inventory,
	azureInventory AzureInventory,
	dockerRuntime DockerRuntime,
) *Service {
	localStackMgr := localstack.NewManager(settings)
	azureRuntime := flociaz.NewManager(settings)
	return NewWithRuntimes(settings, store, discoveryService, s3Inventory, ec2Inventory, azureInventory, dockerRuntime, localStackMgr, azureRuntime)
}

func NewWithRuntimes(
	settings config.Settings,
	store *store.Store,
	discoveryService *discovery.Service,
	s3Inventory S3Inventory,
	ec2Inventory EC2Inventory,
	azureInventory AzureInventory,
	dockerRuntime DockerRuntime,
	localStackMgr LocalStackManager,
	azureRuntime AzureRuntimeManager,
) *Service {
	recipeLoader := recipes.Bundled()
	deployEngine := deploy.NewEngine(tofu.NewRunner(tofu.Resolve(settings)), settings, recipeLoader)
	return &Service{
		settings:      settings,
		store:         store,
		discovery:     discoveryService,
		s3:            s3Inventory,
		ec2:           ec2Inventory,
		azure:         azureInventory,
		docker:        dockerRuntime,
		localstackMgr: localStackMgr,
		azureRuntime:  azureRuntime,
		recipes:               recipeLoader,
		deployer:              deployEngine,
		cipher:                loadCipher(settings.SecretKeyPath),
		azureInventoryTimeout: defaultAzureInventoryTimeout,
		now:                   func() time.Time { return time.Now().UTC() },
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
		snapshot, err := s.discovery.Discover()
		if err != nil {
			return nil, err
		}
		s.mu.Lock()
		defer s.mu.Unlock()
		session, err := s.currentState(ctx, snapshot)
		return session, err
	case "workspace.get":
		snapshot, err := s.discovery.Discover()
		if err != nil {
			return nil, err
		}
		// Hold the service mutex only while reading/reconciling the stored
		// session. buildWorkspaceSnapshot performs slow external probes (Docker,
		// AWS) that must not block other requests such as session.unlock, which
		// the Local Runtime tab polls into contention every few seconds.
		s.mu.Lock()
		session, err := s.currentState(ctx, snapshot)
		s.mu.Unlock()
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
		snapshot, err := s.discovery.Discover()
		if err != nil {
			return nil, err
		}
		s.mu.Lock()
		defer s.mu.Unlock()
		session, err := s.currentState(ctx, snapshot)
		if err != nil {
			return nil, err
		}
		if !session.IsLocked || session.CurrentProviderID != "aws" {
			return nil, errors.New("open an AWS workspace before selecting an S3 bucket")
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
		snapshot, err := s.discovery.Discover()
		if err != nil {
			return nil, err
		}
		s.mu.Lock()
		defer s.mu.Unlock()
		session, err := s.currentState(ctx, snapshot)
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
		snapshot, err := s.discovery.Discover()
		if err != nil {
			return nil, err
		}
		s.mu.Lock()
		defer s.mu.Unlock()
		session, err := s.currentState(ctx, snapshot)
		if err != nil {
			return nil, err
		}
		if !session.IsLocked || session.CurrentProviderID != "aws" {
			return nil, errors.New("open an AWS workspace before setting an S3 prefix filter")
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
		snapshot, err := s.discovery.Discover()
		if err != nil {
			return nil, err
		}
		s.mu.Lock()
		session, err := s.currentState(ctx, snapshot)
		if err != nil {
			s.mu.Unlock()
			return nil, err
		}
		profile, bucketName, err := s.activeS3Selection(snapshot, session, true)
		if err != nil {
			s.mu.Unlock()
			return nil, err
		}
		if !profileAllowsAWSWrites(profile) {
			s.mu.Unlock()
			return nil, errors.New("S3 uploads require a selected AWS profile with local endpoint_url and cloudsprocket_allow_writes = true")
		}
		if err := validateS3UploadRequest(request.SourcePath, request.ObjectKey); err != nil {
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
		snapshot, err := s.discovery.Discover()
		if err != nil {
			return nil, err
		}
		s.mu.Lock()
		session, err := s.currentState(ctx, snapshot)
		if err != nil {
			s.mu.Unlock()
			return nil, err
		}
		profile, bucketName, err := s.activeS3Selection(snapshot, session, true)
		if err != nil {
			s.mu.Unlock()
			return nil, err
		}
		request.DurationSeconds = clampPresignDuration(request.DurationSeconds)
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
		snapshot, err := s.discovery.Discover()
		if err != nil {
			return nil, err
		}
		s.mu.Lock()
		defer s.mu.Unlock()
		session, err := s.currentState(ctx, snapshot)
		if err != nil {
			return nil, err
		}
		if !session.IsLocked || session.CurrentProviderID != "aws" {
			return nil, errors.New("open an AWS workspace before selecting an EC2 region")
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
		snapshot, err := s.discovery.Discover()
		if err != nil {
			return nil, err
		}
		s.mu.Lock()
		defer s.mu.Unlock()
		session, err := s.currentState(ctx, snapshot)
		if err != nil {
			return nil, err
		}
		if !session.IsLocked || session.CurrentProviderID != "aws" {
			return nil, errors.New("open an AWS workspace before selecting an EC2 instance")
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
		snapshot, err := s.discovery.Discover()
		if err != nil {
			return nil, err
		}
		s.mu.Lock()
		session, err := s.currentState(ctx, snapshot)
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
	case "azure.selectResourceGroup":
		var request struct {
			ResourceGroup string `json:"resourceGroup"`
		}
		if err := json.Unmarshal(params, &request); err != nil {
			return nil, err
		}
		snapshot, err := s.discovery.Discover()
		if err != nil {
			return nil, err
		}
		s.mu.Lock()
		defer s.mu.Unlock()
		session, err := s.currentState(ctx, snapshot)
		if err != nil {
			return nil, err
		}
		if !session.IsLocked || session.CurrentProviderID != "azure" {
			return nil, errors.New("open an Azure workspace before selecting a resource group")
		}
		session.SelectedAzureResourceGroup = request.ResourceGroup
		session.SelectedAzureVMID = ""
		if err := s.store.SaveSession(ctx, session); err != nil {
			return nil, err
		}
		return s.buildWorkspaceSnapshot(snapshot, session), s.notifyStateAndLog(
			ctx,
			snapshot,
			session,
			notifier,
			"info",
			fmt.Sprintf("Selected Azure resource group %s.", request.ResourceGroup),
		)
	case "azure.selectVirtualMachine":
		var request struct {
			VMID string `json:"vmId"`
		}
		if err := json.Unmarshal(params, &request); err != nil {
			return nil, err
		}
		snapshot, err := s.discovery.Discover()
		if err != nil {
			return nil, err
		}
		s.mu.Lock()
		defer s.mu.Unlock()
		session, err := s.currentState(ctx, snapshot)
		if err != nil {
			return nil, err
		}
		if !session.IsLocked || session.CurrentProviderID != "azure" {
			return nil, errors.New("open an Azure workspace before selecting a virtual machine")
		}
		session.SelectedAzureVMID = request.VMID
		if err := s.store.SaveSession(ctx, session); err != nil {
			return nil, err
		}
		return s.buildWorkspaceSnapshot(snapshot, session), nil
	case "session.selectProvider":
		var request struct {
			ProviderID string `json:"providerId"`
		}
		if err := json.Unmarshal(params, &request); err != nil {
			return nil, err
		}
		snapshot, err := s.discovery.Discover()
		if err != nil {
			return nil, err
		}
		s.mu.Lock()
		defer s.mu.Unlock()
		session, err := s.currentState(ctx, snapshot)
		if err != nil {
			return nil, err
		}
		session.IsLocked = false
		session.CurrentProviderID = request.ProviderID
		session.SelectedProfileID = ""
		session.SelectedAuthMethod = ""
		session.SelectedAzureResourceGroup = ""
		session.SelectedAzureVMID = ""
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
		snapshot, err := s.discovery.Discover()
		if err != nil {
			return nil, err
		}
		s.mu.Lock()
		defer s.mu.Unlock()
		session, err := s.currentState(ctx, snapshot)
		if err != nil {
			return nil, err
		}
		session.IsLocked = false
		session.CurrentProviderID = request.ProviderID
		session.SelectedProfileID = request.ProfileID
		session.SelectedAuthMethod = ""
		session.SelectedAzureResourceGroup = ""
		session.SelectedAzureVMID = ""
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
		snapshot, err := s.discovery.Discover()
		if err != nil {
			return nil, err
		}
		s.mu.Lock()
		defer s.mu.Unlock()
		session, err := s.currentState(ctx, snapshot)
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
		snapshot, err := s.discovery.Discover()
		if err != nil {
			return nil, err
		}
		s.mu.Lock()
		defer s.mu.Unlock()
		session, err := s.currentState(ctx, snapshot)
		if err != nil {
			return nil, err
		}
		if session.CurrentProviderID == "" || session.SelectedProfileID == "" || session.SelectedAuthMethod == "" {
			return nil, errors.New("select a provider, profile, and auth method before opening the workspace")
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
		return session, s.notifyStateAndLog(ctx, snapshot, session, notifier, "success", fmt.Sprintf("Opened %s workspace for %s.", session.LockedProviderID, session.LockedProfileID))
	case "session.unlock":
		snapshot, err := s.discovery.Discover()
		if err != nil {
			return nil, err
		}
		s.mu.Lock()
		defer s.mu.Unlock()
		session, ok, err := s.store.LoadSession(ctx)
		if err != nil {
			return nil, err
		}
		if !ok {
			session = models.SessionSnapshot{}
		}
		session.IsLocked = false
		session.WorkspaceTabs = []models.WorkspaceTab{}
		session = reconcileSession(session, snapshot)
		if err := s.store.SaveSession(ctx, session); err != nil {
			return nil, err
		}
		return session, s.notifyStateAndLog(ctx, snapshot, session, notifier, "info", "Closed the active workspace.")
	case "logs.list":
		var request struct {
			Limit int `json:"limit"`
		}
		_ = json.Unmarshal(params, &request)
		return s.store.ListLogs(ctx, request.Limit)
	case "app.settings.get":
		return s.settingsSnapshot(), nil
	case "app.reset":
		var request struct {
			Confirmation string `json:"confirmation"`
		}
		_ = json.Unmarshal(params, &request)
		if strings.TrimSpace(request.Confirmation) != "RESET" {
			return nil, errors.New("type RESET to confirm the app reset")
		}
		return s.resetAppData(ctx, notifier)
	case "docker.runtime.get":
		// Manual refresh forces a fresh probe (bypassing the unreachable cache).
		return s.probeDockerRuntimeSnapshot(), nil
	case "docker.resources.list":
		return s.dockerResources(), nil
	case "emulators.list":
		return s.emulatorsList(), nil
	case "emulators.prepareProfile":
		var request struct {
			EmulatorID string `json:"emulatorId"`
		}
		_ = json.Unmarshal(params, &request)
		result, err := s.emulatorsPrepareProfile(request.EmulatorID)
		if err != nil {
			return nil, err
		}
		return result, nil
	case "emulators.start":
		var request models.LocalStackStartOptions
		_ = json.Unmarshal(params, &request)
		return s.emulatorsStart(ctx, request)
	case "emulators.stop":
		var request struct {
			EmulatorID string `json:"emulatorId"`
		}
		_ = json.Unmarshal(params, &request)
		return s.emulatorsStop(ctx, request.EmulatorID)
	case "emulators.logs":
		var request struct {
			EmulatorID string `json:"emulatorId"`
			Tail       int    `json:"tail"`
		}
		_ = json.Unmarshal(params, &request)
		if request.EmulatorID != "" && request.EmulatorID != "localstack" && request.EmulatorID != "floci-az" {
			return nil, fmt.Errorf("emulator %s is not supported", request.EmulatorID)
		}
		return s.emulatorsLogs(ctx, request.EmulatorID, request.Tail)
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
	case "recipes.list":
		return s.recipes.List()
	case "recipes.get":
		var request struct {
			RecipeID string `json:"recipeId"`
		}
		if err := json.Unmarshal(params, &request); err != nil {
			return nil, err
		}
		return s.recipes.Load(request.RecipeID)
	case "tofu.status":
		return s.tofuStatus(ctx), nil
	case "tofu.install":
		job := models.JobStatus{JobID: s.newJobID(), Label: "Install OpenTofu", Status: "queued", Message: "Preparing the OpenTofu engine."}
		go s.runTofuInstall(job, notifier)
		return job, nil
	case "deployments.list":
		return s.deploymentsList(ctx)
	case "deployments.get":
		var request struct {
			DeploymentID string `json:"deploymentId"`
		}
		if err := json.Unmarshal(params, &request); err != nil {
			return nil, err
		}
		return s.deploymentGet(ctx, request.DeploymentID)
	case "deployments.plan":
		var request deploymentPlanRequest
		if err := json.Unmarshal(params, &request); err != nil {
			return nil, err
		}
		return s.startDeploymentPlan(ctx, request, notifier)
	case "deployments.apply":
		var request struct {
			DeploymentID string `json:"deploymentId"`
		}
		if err := json.Unmarshal(params, &request); err != nil {
			return nil, err
		}
		return s.startDeploymentAction(request.DeploymentID, actionApply, notifier)
	case "deployments.destroy":
		var request struct {
			DeploymentID string `json:"deploymentId"`
		}
		if err := json.Unmarshal(params, &request); err != nil {
			return nil, err
		}
		return s.startDeploymentAction(request.DeploymentID, actionDestroy, notifier)
	default:
		return nil, fmt.Errorf("unknown backend method: %s", method)
	}
}

func (s *Service) currentState(ctx context.Context, snapshot discovery.Snapshot) (models.SessionSnapshot, error) {
	stored, ok, err := s.store.LoadSession(ctx)
	if err != nil {
		return models.SessionSnapshot{}, err
	}
	if !ok {
		stored = models.SessionSnapshot{}
	}

	session := reconcileSession(stored, snapshot)
	if err := s.store.SaveSession(ctx, session); err != nil {
		return models.SessionSnapshot{}, err
	}
	return session, nil
}

func (s *Service) resetAppData(ctx context.Context, notifier Notifier) (models.AppResetResult, error) {
	s.mu.Lock()
	if err := s.store.ResetAppData(ctx); err != nil {
		s.mu.Unlock()
		return models.AppResetResult{}, err
	}
	session := models.SessionSnapshot{}
	if err := s.store.SaveSession(ctx, session); err != nil {
		s.mu.Unlock()
		return models.AppResetResult{}, err
	}
	s.mu.Unlock()

	resetPaths := []string{}
	skippedPaths := []string{}
	for _, target := range []struct {
		path         string
		expectedName string
	}{
		{path: s.settings.LocalConfigDir, expectedName: "local-config"},
		{path: s.settings.EmulatorStateDir, expectedName: "emulators"},
	} {
		resetPath, skipped, err := managedDirectoryTarget(s.settings.ConfigDir, target.path, target.expectedName)
		if err != nil {
			return models.AppResetResult{}, err
		}
		if resetPath != "" {
			resetPaths = append(resetPaths, resetPath)
			go func(path string) {
				_ = resetManagedDirectoryPath(path)
			}(resetPath)
		}
		if skipped != "" {
			skippedPaths = append(skippedPaths, skipped)
		}
	}

	if notifier != nil {
		if err := notifier.Notify("state.changed", statePayload(discovery.Snapshot{}, session)); err != nil {
			return models.AppResetResult{}, err
		}
	}

	return models.AppResetResult{
		Summary:      "CloudSprocket app state has been reset. External AWS, Azure, and GCP config files were not touched.",
		ResetPaths:   resetPaths,
		SkippedPaths: skippedPaths,
	}, nil
}

func resetManagedDirectory(configRoot string, targetPath string, expectedName string) (string, string, error) {
	target, skipped, err := managedDirectoryTarget(configRoot, targetPath, expectedName)
	if err != nil || target == "" {
		return target, skipped, err
	}
	if err := resetManagedDirectoryPath(target); err != nil {
		return "", "", err
	}
	return target, "", nil
}

func managedDirectoryTarget(configRoot string, targetPath string, expectedName string) (string, string, error) {
	if strings.TrimSpace(configRoot) == "" || strings.TrimSpace(targetPath) == "" {
		return "", targetPath, nil
	}

	root, err := filepath.Abs(configRoot)
	if err != nil {
		return "", targetPath, err
	}
	target, err := filepath.Abs(targetPath)
	if err != nil {
		return "", targetPath, err
	}
	if filepath.Base(target) != expectedName {
		return "", target, nil
	}
	rel, err := filepath.Rel(root, target)
	if err != nil {
		return "", target, err
	}
	if rel == "." || strings.HasPrefix(rel, ".."+string(os.PathSeparator)) || rel == ".." || filepath.IsAbs(rel) {
		return "", target, nil
	}

	return target, "", nil
}

func resetManagedDirectoryPath(target string) error {
	if err := os.RemoveAll(target); err != nil {
		return err
	}
	if err := os.MkdirAll(target, 0o755); err != nil {
		return err
	}
	return nil
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

	snapshot, err := s.discovery.Discover()
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

	s.mu.Lock()
	defer s.mu.Unlock()

	session, err := s.currentState(background, snapshot)
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
		PlatformName:     s.settings.PlatformName,
		ConfigDir:        s.settings.ConfigDir,
		DatabasePath:     s.settings.DatabasePath,
		LogPath:          s.settings.LogPath,
		RuntimeMode:      runtimeModeFromSettings(s.settings.RuntimeMode),
		LocalConfigDir:   s.settings.LocalConfigDir,
		EmulatorStateDir: s.settings.EmulatorStateDir,
		LocalStackImage:  s.settings.LocalStackImage,
		FlociAZImage:     s.settings.FlociAZImage,
	}
}

func runtimeModeFromSettings(value string) models.RuntimeMode {
	switch strings.TrimSpace(strings.ToLower(value)) {
	case string(models.RuntimeModeLocalEmulator):
		return models.RuntimeModeLocalEmulator
	default:
		return models.RuntimeModeCloud
	}
}

// dockerRuntimeSnapshot returns the Docker runtime state, serving a recent
// "unreachable" verdict from cache so polling does not repeatedly pay the probe
// timeout while the engine is stopped.
func (s *Service) dockerRuntimeSnapshot() models.DockerRuntimeSnapshot {
	if cached, ok := s.cachedUnreachableDocker(); ok {
		return cached
	}
	return s.probeDockerRuntimeSnapshot()
}

func (s *Service) cachedUnreachableDocker() (models.DockerRuntimeSnapshot, bool) {
	s.dockerSnapshotMu.Lock()
	defer s.dockerSnapshotMu.Unlock()
	if s.dockerSnapshotValue != nil &&
		!s.dockerSnapshotValue.Reachable &&
		s.now().Sub(s.dockerSnapshotAt) < dockerUnreachableCacheTTL {
		return *s.dockerSnapshotValue, true
	}
	return models.DockerRuntimeSnapshot{}, false
}

// probeDockerRuntimeSnapshot always probes the engine (bypassing the cache) and
// records the result. It backs the manual "Refresh Docker" action.
func (s *Service) probeDockerRuntimeSnapshot() models.DockerRuntimeSnapshot {
	snapshot := s.buildDockerRuntimeSnapshot()
	s.dockerSnapshotMu.Lock()
	cached := snapshot
	s.dockerSnapshotValue = &cached
	s.dockerSnapshotAt = s.now()
	s.dockerSnapshotMu.Unlock()
	return snapshot
}

func (s *Service) buildDockerRuntimeSnapshot() models.DockerRuntimeSnapshot {
	if s.docker != nil {
		ctx, cancel := context.WithTimeout(context.Background(), dockerProbeTimeout)
		defer cancel()
		snapshot, err := s.docker.Snapshot(ctx)
		if err == nil {
			return snapshot
		}
	}

	host, source := s.detectDockerHost()
	contextName := strings.TrimSpace(os.Getenv("DOCKER_CONTEXT"))
	summary := "Docker engine was not detected in the current local runtime."
	if host != "" {
		summary = "Docker engine endpoint was detected, but live runtime probing is unavailable."
	}

	return models.DockerRuntimeSnapshot{
		Reachable:   false,
		Host:        host,
		HostSource:  source,
		ContextName: contextName,
		EngineName:  "docker",
		ResourceOwnership: models.DockerOwnershipPolicy{
			LabelKey:        "com.cloudsprocket.managed",
			LabelValue:      "true",
			ProjectLabelKey: "com.cloudsprocket.project",
			ProjectName:     "cloud-sprocket",
			Summary:         "Only CloudSprocket-managed Docker resources are eligible for future lifecycle control.",
		},
		Summary: summary,
		Details: []models.DetailField{
			{Label: "Host Source", Value: firstNonEmpty(source, "Not detected")},
			{Label: "Host", Value: firstNonEmpty(host, "Not detected")},
			{Label: "Context", Value: firstNonEmpty(contextName, "Default context")},
		},
	}
}

func (s *Service) dockerResources() []models.ManagedDockerResource {
	if s.docker == nil {
		return []models.ManagedDockerResource{}
	}
	ctx, cancel := context.WithTimeout(context.Background(), dockerProbeTimeout)
	defer cancel()
	resources, err := s.docker.ListOwnedResources(ctx)
	if err != nil {
		return []models.ManagedDockerResource{}
	}
	return resources
}

func (s *Service) dockerDiagnostics() models.DockerDiagnostics {
	return s.dockerDiagnosticsFromSnapshot(s.dockerRuntimeSnapshot())
}

func (s *Service) dockerDiagnosticsFromSnapshot(runtime models.DockerRuntimeSnapshot) models.DockerDiagnostics {
	state := models.DockerEngineStateUnknown
	if runtime.Host != "" {
		state = models.DockerEngineStateUnavailable
	}
	if runtime.Reachable {
		state = models.DockerEngineStateAvailable
	}
	details := append([]models.DetailField{}, runtime.Details...)
	if s.settings.PlatformName == "windows" && runtime.Host == "" {
		details = append(details, models.DetailField{
			Label: "Note",
			Value: "Windows named-pipe verification is deferred until the Docker runtime slice.",
		})
	}

	return models.DockerDiagnostics{
		EngineState: state,
		Summary:     runtime.Summary,
		ContextName: runtime.ContextName,
		Host:        runtime.Host,
		Details:     details,
	}
}

func (s *Service) detectDockerHost() (string, string) {
	if host := strings.TrimSpace(os.Getenv("DOCKER_HOST")); host != "" {
		return host, "DOCKER_HOST"
	}

	if s.settings.PlatformName == "windows" {
		return "", "No named-pipe probe in foundation slice"
	}

	candidates := []string{}
	if home := strings.TrimSpace(s.settings.HomeDir); home != "" {
		if s.settings.PlatformName == "linux" {
			candidates = append(candidates,
				filepath.Join(home, ".docker", "desktop", "docker.sock"),
			)
			if runtimeDir := strings.TrimSpace(os.Getenv("XDG_RUNTIME_DIR")); runtimeDir != "" {
				candidates = append(candidates, filepath.Join(runtimeDir, "docker.sock"))
			}
		}
		if s.settings.PlatformName == "macos" {
			candidates = append(candidates, filepath.Join(home, ".docker", "run", "docker.sock"))
		}
	}
	candidates = append(candidates, "/var/run/docker.sock")

	for _, candidate := range candidates {
		if _, err := os.Stat(candidate); err == nil {
			return "unix://" + candidate, "Local socket"
		}
	}

	return "", "No Docker host detected"
}

func (s *Service) emulatorSummaries() []models.EmulatorSummary {
	artifacts := s.localConfigArtifacts()
	awsDetails := []models.DetailField{
		{Label: "Image", Value: s.settings.LocalStackImage},
		{Label: "Managed Config Root", Value: filepath.Join(s.settings.LocalConfigDir, "aws")},
	}
	azureDetails := []models.DetailField{
		{Label: "Image", Value: s.settings.FlociAZImage},
		{Label: "Managed Config Root", Value: filepath.Join(s.settings.LocalConfigDir, "azure")},
	}
	if len(artifacts) > 0 {
		awsDetails = append(awsDetails, models.DetailField{Label: "Managed Artifacts", Value: "Prepared paths only in this slice"})
		azureDetails = append(azureDetails, models.DetailField{Label: "Managed Artifacts", Value: "Prepared paths only in this slice"})
	}

	return []models.EmulatorSummary{
		{
			EmulatorID: "localstack",
			ProviderID: "aws",
			Label:      "LocalStack",
			Kind:       "docker",
			Status:     models.EmulatorStatusNotConfigured,
			Summary:    "Managed AWS local runtime is planned but not configured yet.",
			Details:    awsDetails,
		},
		{
			EmulatorID: "floci-az",
			ProviderID: "azure",
			Label:      "floci-az",
			Kind:       "docker",
			Status:     models.EmulatorStatusNotConfigured,
			Summary:    "Managed Azure local runtime is planned but not configured yet.",
			Details:    azureDetails,
		},
	}
}

func (s *Service) localConfigArtifacts() []models.LocalConfigArtifact {
	artifacts := []models.LocalConfigArtifact{
		newLocalConfigArtifact(
			"aws-local-config",
			"aws",
			"AWS Local Config",
			filepath.Join(s.settings.LocalConfigDir, "aws", "config"),
			"App-managed AWS local profile configuration will be written here.",
		),
		newLocalConfigArtifact(
			"aws-local-credentials",
			"aws",
			"AWS Local Credentials",
			filepath.Join(s.settings.LocalConfigDir, "aws", "credentials"),
			"App-managed AWS local dummy credentials will be written here.",
		),
		newLocalConfigArtifact(
			"azure-local-env",
			"azure",
			"Azure Local Env File",
			filepath.Join(s.settings.LocalConfigDir, "azure", "floci-az.env"),
			"App-managed Azure local connection strings and env values will be written here.",
		),
	}
	return artifacts
}

func newLocalConfigArtifact(id string, providerID string, label string, path string, pendingSummary string) models.LocalConfigArtifact {
	status := "not-created"
	summary := pendingSummary
	if strings.TrimSpace(path) != "" {
		if _, err := os.Stat(path); err == nil {
			status = "available"
			summary = "Managed local configuration artefact is present."
		}
	}
	return models.LocalConfigArtifact{
		ArtifactID: id,
		ProviderID: providerID,
		Label:      label,
		Path:       path,
		Status:     status,
		Managed:    true,
		Summary:    summary,
	}
}

func (s *Service) environmentDiagnostics(snapshot discovery.Snapshot, session models.SessionSnapshot) []models.DetailField {
	fields := []models.DetailField{
		{Label: "Platform", Value: s.settings.PlatformName},
		{Label: "Config Directory", Value: pathStatus(s.settings.ConfigDir, true)},
		{Label: "Local Config Directory", Value: pathStatus(s.settings.LocalConfigDir, true)},
		{Label: "Emulator State Directory", Value: pathStatus(s.settings.EmulatorStateDir, true)},
		{Label: "Database", Value: pathStatus(s.settings.DatabasePath, false)},
		{Label: "Log Directory", Value: pathStatus(filepath.Dir(s.settings.LogPath), true)},
		{Label: "AWS Config", Value: pathStatus(s.settings.AWSConfigPath, false)},
		{Label: "AWS Credentials", Value: pathStatus(s.settings.AWSCredentialsPath, false), Sensitive: true},
		{Label: "Azure Profile", Value: pathStatus(s.settings.AzureProfilePath(), false)},
		{Label: "GCloud Config", Value: pathStatus(s.settings.GCloudConfigDir(), true)},
	}
	if provider, ok := findProvider(snapshot.Providers, session.CurrentProviderID); ok {
		cliStatus := "Not detected"
		if provider.CommandPath != "" {
			cliStatus = provider.CommandPath
		}
		fields = append(fields, models.DetailField{Label: provider.Label + " CLI", Value: cliStatus})
	}
	if profile, ok := findProfile(filterProfiles(snapshot.Profiles, session.CurrentProviderID), session.SelectedProfileID); ok {
		fields = append(fields,
			models.DetailField{Label: "Selected Profile", Value: profile.ProfileID},
			models.DetailField{Label: "Write Policy", Value: writePolicySummary(profile)},
		)
	}
	return fields
}

func pathStatus(path string, directory bool) string {
	if strings.TrimSpace(path) == "" {
		return "Not configured"
	}
	info, err := os.Stat(path)
	if err != nil {
		if os.IsNotExist(err) {
			return path + " (missing)"
		}
		return path + " (" + err.Error() + ")"
	}
	if directory && !info.IsDir() {
		return path + " (not a directory)"
	}
	if !directory && info.IsDir() {
		return path + " (directory)"
	}
	return path + " (available)"
}

func writePolicySummary(profile models.ProfileSummary) string {
	if profileAllowsAWSWrites(profile) {
		return "Writes enabled for local endpoint profile"
	}
	if profileAllowsWriteOptIn(profile) {
		return "Write opt-in present, but endpoint is not local"
	}
	return "Read-only until cloudsprocket_allow_writes and a local endpoint_url are configured"
}

func (s *Service) buildWorkspaceSnapshot(
	snapshot discovery.Snapshot,
	session models.SessionSnapshot,
) models.WorkspaceSnapshot {
	dockerRuntime := s.dockerRuntimeSnapshot()
	// Only enumerate managed Docker resources when the engine is reachable. When
	// Docker is stopped the resource probe would otherwise wait out its own
	// timeout to return an empty list, doubling the Docker latency of every
	// workspace fetch and Local Runtime poll.
	dockerResources := []models.ManagedDockerResource{}
	// When the engine is unreachable, skip the per-emulator Docker probes too and
	// fall back to the static planned summaries. Each live probe would otherwise
	// wait out its own timeout, and with both LocalStack and floci-az that adds
	// several seconds to every workspace fetch and Local Runtime poll.
	emulatorSummaries := s.emulatorSummaries()
	if dockerRuntime.Reachable {
		dockerResources = s.dockerResources()
		emulatorSummaries = s.emulatorsList()
	}
	workspace := models.WorkspaceSnapshot{
		AuthMethod:             session.SelectedAuthMethod,
		RuntimeSettings:        s.settingsSnapshot(),
		EnvironmentDiagnostics: s.environmentDiagnostics(snapshot, session),
		DockerDiagnostics:      s.dockerDiagnosticsFromSnapshot(dockerRuntime),
		DockerRuntime:          dockerRuntime,
		DockerResources:        dockerResources,
		EmulatorSummaries:      emulatorSummaries,
		LocalConfigArtifacts:   s.localConfigArtifacts(),
		AzureResourceGroups:    []models.AzureResourceGroup{},
		AzureVirtualMachines:   []models.AzureVirtualMachine{},
		S3PrefixFilter:         session.S3PrefixFilter,
		S3Buckets:              []models.AwsS3Bucket{},
		S3Objects:              []models.AwsS3Object{},
		S3ObjectMetadata:       []models.DetailField{},
		EC2Regions:             []string{},
		EC2Instances:           []models.AwsEc2Instance{},
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
		workspace.Provider.ProviderID == "azure" &&
		workspace.Profile != nil &&
		s.azure != nil {
		workspace.AzureResourceGroups = s.azureResourceGroups(context.Background(), *workspace.Profile)
		workspace.SelectedAzureResourceGroup = s.selectedAzureResourceGroup(session, workspace.AzureResourceGroups)
		workspace.AzureVirtualMachines = s.azureVirtualMachines(
			context.Background(),
			*workspace.Profile,
			workspace.SelectedAzureResourceGroup,
		)
		workspace.SelectedAzureVMID = s.selectedAzureVMID(session, workspace.AzureVirtualMachines)
		if len(workspace.AzureResourceGroups) == 0 {
			workspace.AzureStatusMessage = "No Azure resource groups are currently available for this workspace."
		} else if workspace.SelectedAzureResourceGroup == "" {
			workspace.AzureStatusMessage = "Select an Azure resource group to inspect its virtual machines."
		} else if len(workspace.AzureVirtualMachines) == 0 {
			workspace.AzureStatusMessage = fmt.Sprintf("No Azure virtual machines were returned for %s.", workspace.SelectedAzureResourceGroup)
		} else {
			workspace.AzureStatusMessage = fmt.Sprintf(
				"Loaded %d Azure virtual machines from %s.",
				len(workspace.AzureVirtualMachines),
				workspace.SelectedAzureResourceGroup,
			)
		}
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
			workspace.S3StatusMessage = "No buckets are currently available for this AWS workspace."
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
			workspace.EC2StatusMessage = "No EC2 region is available for this AWS workspace."
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
		return models.ProfileSummary{}, "", errors.New("open an AWS workspace before using S3 actions")
	}
	profile, ok := findProfile(filterProfiles(snapshot.Profiles, session.CurrentProviderID), session.SelectedProfileID)
	if !ok {
		return models.ProfileSummary{}, "", errors.New("the workspace's AWS profile is not available")
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

// withAzureTimeout bounds an Azure inventory call. A non-positive configured
// timeout (e.g. a directly-constructed test Service) leaves the context as-is.
func (s *Service) withAzureTimeout(ctx context.Context) (context.Context, context.CancelFunc) {
	if s.azureInventoryTimeout <= 0 {
		return ctx, func() {}
	}
	return context.WithTimeout(ctx, s.azureInventoryTimeout)
}

func (s *Service) azureResourceGroups(
	ctx context.Context,
	profile models.ProfileSummary,
) []models.AzureResourceGroup {
	const scope = "azure.resource-groups"
	queryHash := profile.ProfileID
	ctx, cancel := s.withAzureTimeout(ctx)
	defer cancel()
	groups, err := s.azure.ListResourceGroups(ctx, profile)
	if err == nil {
		_ = s.store.SaveResourceCache(ctx, scope, queryHash, groups, s.timestamp())
		return groups
	}

	var cached []models.AzureResourceGroup
	_, ok, cacheErr := s.store.LoadResourceCache(ctx, scope, queryHash, &cached)
	if cacheErr == nil && ok {
		return cached
	}

	return []models.AzureResourceGroup{}
}

func (s *Service) selectedAzureResourceGroup(
	session models.SessionSnapshot,
	groups []models.AzureResourceGroup,
) string {
	if session.SelectedAzureResourceGroup != "" {
		for _, group := range groups {
			if group.Name == session.SelectedAzureResourceGroup {
				return session.SelectedAzureResourceGroup
			}
		}
	}
	if len(groups) == 0 {
		return ""
	}
	return groups[0].Name
}

func (s *Service) azureVirtualMachines(
	ctx context.Context,
	profile models.ProfileSummary,
	resourceGroup string,
) []models.AzureVirtualMachine {
	if resourceGroup == "" {
		return []models.AzureVirtualMachine{}
	}

	const scope = "azure.virtual-machines"
	queryHash := profile.ProfileID + "|" + resourceGroup
	ctx, cancel := s.withAzureTimeout(ctx)
	defer cancel()
	vms, err := s.azure.ListVirtualMachines(ctx, profile, resourceGroup)
	if err == nil {
		_ = s.store.SaveResourceCache(ctx, scope, queryHash, vms, s.timestamp())
		return vms
	}

	var cached []models.AzureVirtualMachine
	_, ok, cacheErr := s.store.LoadResourceCache(ctx, scope, queryHash, &cached)
	if cacheErr == nil && ok {
		return cached
	}

	return []models.AzureVirtualMachine{}
}

func (s *Service) selectedAzureVMID(
	session models.SessionSnapshot,
	vms []models.AzureVirtualMachine,
) string {
	if session.SelectedAzureVMID != "" {
		for _, vm := range vms {
			if vm.VMID == session.SelectedAzureVMID {
				return session.SelectedAzureVMID
			}
		}
	}
	if len(vms) == 0 {
		return ""
	}
	return vms[0].VMID
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
		return models.ProfileSummary{}, "", "", errors.New("open an AWS workspace before using EC2 actions")
	}
	profile, ok := findProfile(filterProfiles(snapshot.Profiles, session.CurrentProviderID), session.SelectedProfileID)
	if !ok {
		return models.ProfileSummary{}, "", "", errors.New("the workspace's AWS profile is not available")
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

func validateS3UploadRequest(sourcePath string, objectKey string) error {
	sourcePath = strings.TrimSpace(sourcePath)
	objectKey = strings.TrimSpace(objectKey)
	if sourcePath == "" || objectKey == "" {
		return errors.New("source path and destination object key are required")
	}
	if strings.HasPrefix(objectKey, "/") || strings.HasPrefix(objectKey, "\\") {
		return errors.New("destination object key must be relative to the selected bucket")
	}
	if strings.Contains(objectKey, "\\") {
		return errors.New("destination object key must use forward slashes")
	}
	for _, segment := range strings.Split(objectKey, "/") {
		if segment == "." || segment == ".." {
			return errors.New("destination object key must not contain dot path segments")
		}
	}
	if strings.ContainsAny(objectKey, "\x00\r\n\t") {
		return errors.New("destination object key contains unsupported control characters")
	}
	info, err := os.Stat(sourcePath)
	if err != nil {
		return fmt.Errorf("source file is not available: %w", err)
	}
	if info.IsDir() || !info.Mode().IsRegular() {
		return errors.New("source path must be a regular file")
	}
	const maxUploadBytes = 512 * 1024 * 1024
	if info.Size() > maxUploadBytes {
		return errors.New("source file is larger than the current 512 MiB upload safety limit")
	}
	return nil
}

func clampPresignDuration(durationSeconds int) int {
	if durationSeconds <= 0 {
		return 900
	}
	// AWS SigV4 presigned URLs are valid for at most 7 days.
	const maxPresignSeconds = 7 * 24 * 60 * 60
	if durationSeconds > maxPresignSeconds {
		return maxPresignSeconds
	}
	return durationSeconds
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
		session.WorkspaceTabs = workspaceTabs(session.LockedProviderID)
		return session
	}

	return clearLockState(session)
}

func clearLockState(session models.SessionSnapshot) models.SessionSnapshot {
	session.IsLocked = false
	session.LockedProviderID = ""
	session.LockedProfileID = ""
	session.LockedAuthMethod = ""
	session.SelectedAzureResourceGroup = ""
	session.SelectedAzureVMID = ""
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

func workspaceTabs(providerID string) []models.WorkspaceTab {
	overviewTab := models.WorkspaceTab{
		TabID:   "overview",
		Label:   "Overview",
		Summary: "Session-wide provider context and health.",
		Detail:  "Shows the open workspace's cloud context and recent operator activity.",
	}
	activityTab := models.WorkspaceTab{
		TabID:   "actions",
		Label:   "Activity",
		Summary: "Recent job, log, and refresh history.",
		Detail:  "Shows the latest backend activity while the workspace shell continues to expand.",
	}
	virtualisationTab := models.WorkspaceTab{
		TabID:   "virtualisation",
		Label:   "Local Runtime",
		Summary: "Docker and local cloud runtime controls.",
		Detail:  "Manage Docker diagnostics, LocalStack, local config artefacts, and app-owned emulator state.",
	}

	if providerID == "azure" {
		return []models.WorkspaceTab{
			overviewTab,
			virtualisationTab,
			{
				TabID:   "azure-overview",
				Label:   "Azure",
				Summary: "Subscription context and readiness.",
				Detail:  "Surfaces the open Azure subscription details and the next read-only inventory slices.",
			},
			{
				TabID:   "azure-resource-groups",
				Label:   "Resource Groups",
				Summary: "Read-only Azure resource group inventory.",
				Detail:  "Browse resource groups discovered for the open Azure subscription.",
			},
			{
				TabID:   "azure-vms",
				Label:   "Virtual Machines",
				Summary: "Read-only Azure virtual machine inventory.",
				Detail:  "Browse virtual machines for the selected Azure resource group.",
			},
			activityTab,
		}
	}

	if providerID == "gcp" {
		return []models.WorkspaceTab{
			overviewTab,
			virtualisationTab,
			{
				TabID:   "gcp-overview",
				Label:   "GCP",
				Summary: "Project context and readiness.",
				Detail:  "Surfaces the open GCP configuration details while provider-specific inventory is ported.",
			},
			activityTab,
		}
	}

	return []models.WorkspaceTab{
		overviewTab,
		virtualisationTab,
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
		activityTab,
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

func (s *Service) emulatorsList() []models.EmulatorSummary {
	summaries := []models.EmulatorSummary{}

	if s.localstackMgr != nil {
		ctx, cancel := context.WithTimeout(context.Background(), dockerProbeTimeout)
		defer cancel()
		status, err := s.localstackMgr.Status(ctx)
		if err == nil {
			summaries = append(summaries, models.EmulatorSummary{
				EmulatorID: status.EmulatorID,
				ProviderID: status.ProviderID,
				Label:      status.Label,
				Kind:       status.Kind,
				Status:     status.Status,
				Summary:    status.Summary,
				Details:    status.Details,
			})
		}
	}

	if s.azureRuntime != nil {
		ctx, cancel := context.WithTimeout(context.Background(), dockerProbeTimeout)
		defer cancel()
		status, err := s.azureRuntime.Status(ctx)
		if err == nil {
			summaries = append(summaries, models.EmulatorSummary{
				EmulatorID: status.EmulatorID,
				ProviderID: status.ProviderID,
				Label:      status.Label,
				Kind:       status.Kind,
				Status:     status.Status,
				Summary:    status.Summary,
				Details:    status.Details,
			})
		}
	}

	return summaries
}

func (s *Service) emulatorsPrepareProfile(emulatorID string) (models.EmulatorActionResult, error) {
	emulatorID = normaliseEmulatorID(emulatorID)
	if emulatorID == "floci-az" {
		if s.azureRuntime == nil {
			return models.EmulatorActionResult{}, errors.New("floci-az manager not available")
		}
		if err := s.azureRuntime.EnsureManagedConfig(); err != nil {
			return models.EmulatorActionResult{}, fmt.Errorf("failed to prepare managed Azure config: %w", err)
		}
		if err := s.writeLocalAzureSubscription(); err != nil {
			return models.EmulatorActionResult{}, fmt.Errorf("failed to create local Azure profile: %w", err)
		}
		statusCtx, cancel := context.WithTimeout(context.Background(), dockerProbeTimeout)
		defer cancel()
		status, _ := s.azureRuntime.Status(statusCtx)
		status.ProfileName = localAzureProfileName
		status.ConfigPath = s.settings.AzureProfilePath()
		status.Endpoint = "http://localhost:4577"
		if strings.TrimSpace(status.Summary) == "" {
			status.Summary = fmt.Sprintf("Local Azure profile %q is ready in your Azure config. Open it from the Connect screen.", localAzureProfileName)
		}
		return emulatorActionResult("prepareProfile", status), nil
	}
	if s.localstackMgr == nil {
		return models.EmulatorActionResult{}, errors.New("LocalStack manager not available")
	}

	if err := s.localstackMgr.EnsureManagedProfile(); err != nil {
		return models.EmulatorActionResult{}, fmt.Errorf("failed to prepare managed profile: %w", err)
	}
	if err := s.writeLocalAWSProfile(); err != nil {
		return models.EmulatorActionResult{}, fmt.Errorf("failed to create local AWS profile: %w", err)
	}

	statusCtx, cancel := context.WithTimeout(context.Background(), dockerProbeTimeout)
	defer cancel()
	status, _ := s.localstackMgr.Status(statusCtx)
	status.ProfileName = localAWSProfileName
	status.ConfigPath = s.settings.AWSConfigPath
	status.CredsPath = s.settings.AWSCredentialsPath
	status.Endpoint = "http://localhost:4566"
	if strings.TrimSpace(status.Summary) == "" {
		status.Summary = fmt.Sprintf("Local AWS profile %q is ready in your AWS config. Open it from the Connect screen.", localAWSProfileName)
	}
	return emulatorActionResult("prepareProfile", status), nil
}

const (
	localAWSProfileName   = "cloudsprocket-localstack"
	localAzureProfileName = "cloudsprocket-floci-az"
)

// writeLocalAWSProfile upserts a LocalStack-targeted profile into the user's
// real AWS config and credentials files so it is discovered and can be opened.
// Existing sections are preserved.
func (s *Service) writeLocalAWSProfile() error {
	if strings.TrimSpace(s.settings.AWSConfigPath) == "" || strings.TrimSpace(s.settings.AWSCredentialsPath) == "" {
		return errors.New("AWS config paths are not configured")
	}
	configBody := "region = us-east-1\noutput = json\nendpoint_url = http://localhost:4566\ncloudsprocket_allow_writes = true\n"
	if err := upsertINISection(s.settings.AWSConfigPath, "[profile "+localAWSProfileName+"]", configBody, 0o644); err != nil {
		return err
	}
	credsBody := "aws_access_key_id = test\naws_secret_access_key = test\n"
	return upsertINISection(s.settings.AWSCredentialsPath, "["+localAWSProfileName+"]", credsBody, 0o600)
}

// writeLocalAzureSubscription upserts a floci-az-targeted subscription into the
// user's real Azure profile so it is discovered and can be opened. Existing
// subscriptions are preserved.
func (s *Service) writeLocalAzureSubscription() error {
	path := s.settings.AzureProfilePath()
	if strings.TrimSpace(path) == "" {
		return errors.New("Azure profile path is not configured")
	}
	subscription := map[string]any{
		"id":              localAzureProfileName,
		"name":            "CloudSprocket floci-az (local)",
		"state":           "Enabled",
		"isDefault":       false,
		"tenantId":        "cloudsprocket-local",
		"environmentName": "FlociAzLocal",
		"user": map[string]any{
			"name": "local@cloudsprocket",
			"type": "user",
		},
	}
	return upsertAzureSubscription(path, localAzureProfileName, subscription)
}

// upsertINISection writes or replaces a single [header] section's body in an INI
// file while preserving all other sections, comments, and formatting. The file
// and its parent directory are created when missing.
func upsertINISection(path string, header string, body string, perm os.FileMode) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	existing := ""
	if data, err := os.ReadFile(path); err == nil {
		existing = string(data)
	} else if !errors.Is(err, os.ErrNotExist) {
		return err
	}

	bodyLines := strings.Split(strings.TrimRight(body, "\n"), "\n")
	out := []string{}
	found := false
	inTarget := false
	for _, line := range strings.Split(existing, "\n") {
		trimmed := strings.TrimSpace(line)
		isHeader := strings.HasPrefix(trimmed, "[") && strings.HasSuffix(trimmed, "]")
		if isHeader {
			if trimmed == header {
				found = true
				inTarget = true
				out = append(out, header)
				out = append(out, bodyLines...)
				continue
			}
			inTarget = false
		}
		if inTarget {
			// Drop the previous body of the target section until the next header.
			continue
		}
		out = append(out, line)
	}
	if !found {
		for len(out) > 0 && strings.TrimSpace(out[len(out)-1]) == "" {
			out = out[:len(out)-1]
		}
		if len(out) > 0 {
			out = append(out, "")
		}
		out = append(out, header)
		out = append(out, bodyLines...)
	}
	content := strings.TrimRight(strings.Join(out, "\n"), "\n") + "\n"
	return os.WriteFile(path, []byte(content), perm)
}

// upsertAzureSubscription writes or replaces a subscription (matched by id) in
// the user's azureProfile.json while preserving the other subscriptions. A
// UTF-8 BOM (which the az CLI sometimes writes) is tolerated on read.
func upsertAzureSubscription(path string, id string, subscription map[string]any) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	profile := map[string]any{}
	if data, err := os.ReadFile(path); err == nil {
		text := strings.TrimPrefix(string(data), "\ufeff")
		if strings.TrimSpace(text) != "" {
			if err := json.Unmarshal([]byte(text), &profile); err != nil {
				return fmt.Errorf("failed to parse Azure profile: %w", err)
			}
		}
	} else if !errors.Is(err, os.ErrNotExist) {
		return err
	}

	subscriptions := []any{}
	if existing, ok := profile["subscriptions"].([]any); ok {
		subscriptions = existing
	}
	replaced := false
	for index, raw := range subscriptions {
		entry, ok := raw.(map[string]any)
		if !ok {
			continue
		}
		if existingID, ok := entry["id"].(string); ok && existingID == id {
			subscriptions[index] = subscription
			replaced = true
			break
		}
	}
	if !replaced {
		subscriptions = append(subscriptions, subscription)
	}
	profile["subscriptions"] = subscriptions

	encoded, err := json.MarshalIndent(profile, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, encoded, 0o644)
}

func (s *Service) emulatorsStart(ctx context.Context, options models.LocalStackStartOptions) (models.EmulatorActionResult, error) {
	emulatorID := normaliseEmulatorID(options.EmulatorID)
	if emulatorID == "floci-az" {
		if s.azureRuntime == nil {
			return models.EmulatorActionResult{}, errors.New("floci-az manager not available")
		}
		actionCtx, cancel := context.WithTimeout(ctx, 20*time.Second)
		defer cancel()
		status, err := s.azureRuntime.Start(actionCtx, options)
		result := emulatorActionResult("start", status)
		if err != nil {
			return result, errors.New(result.Summary)
		}
		return result, nil
	}
	if s.localstackMgr == nil {
		return models.EmulatorActionResult{}, errors.New("LocalStack manager not available")
	}
	actionCtx, cancel := context.WithTimeout(ctx, 20*time.Second)
	defer cancel()
	status, err := s.localstackMgr.Start(actionCtx, options)
	result := emulatorActionResult("start", status)
	if err != nil {
		return result, errors.New(result.Summary)
	}
	return result, nil
}

func (s *Service) emulatorsStop(ctx context.Context, emulatorID string) (models.EmulatorActionResult, error) {
	emulatorID = normaliseEmulatorID(emulatorID)
	if emulatorID == "floci-az" {
		if s.azureRuntime == nil {
			return models.EmulatorActionResult{}, errors.New("floci-az manager not available")
		}
		actionCtx, cancel := context.WithTimeout(ctx, 20*time.Second)
		defer cancel()
		status, err := s.azureRuntime.Stop(actionCtx)
		result := emulatorActionResult("stop", status)
		if err != nil {
			return result, errors.New(result.Summary)
		}
		return result, nil
	}
	if s.localstackMgr == nil {
		return models.EmulatorActionResult{}, errors.New("LocalStack manager not available")
	}
	actionCtx, cancel := context.WithTimeout(ctx, 20*time.Second)
	defer cancel()
	status, err := s.localstackMgr.Stop(actionCtx)
	result := emulatorActionResult("stop", status)
	if err != nil {
		return result, errors.New(result.Summary)
	}
	return result, nil
}

func (s *Service) emulatorsLogs(ctx context.Context, emulatorID string, tail int) (models.EmulatorLogSnapshot, error) {
	emulatorID = normaliseEmulatorID(emulatorID)
	logsCtx, cancel := context.WithTimeout(ctx, dockerLogsTimeout)
	defer cancel()
	if emulatorID == "floci-az" {
		if s.azureRuntime == nil {
			return models.EmulatorLogSnapshot{}, errors.New("floci-az manager not available")
		}
		return s.azureRuntime.Logs(logsCtx, tail)
	}
	if s.localstackMgr == nil {
		return models.EmulatorLogSnapshot{}, errors.New("LocalStack manager not available")
	}
	return s.localstackMgr.Logs(logsCtx, tail)
}

func emulatorActionResult(action string, status models.LocalStackStatus) models.EmulatorActionResult {
	state := models.EmulatorActionSucceeded
	switch status.Status {
	case models.EmulatorStatusRunning, models.EmulatorStatusStopped:
		state = models.EmulatorActionSucceeded
	case models.EmulatorStatusUnhealthy:
		state = models.EmulatorActionDegraded
	case models.EmulatorStatusNotConfigured, models.EmulatorStatusUnknown:
		state = models.EmulatorActionFailed
	default:
		state = models.EmulatorActionDegraded
	}

	summary := status.Summary
	if summary == "" {
		switch action {
		case "prepareProfile":
			summary = "LocalStack managed profile is prepared."
		case "start":
			summary = "LocalStack start request completed."
		case "stop":
			summary = "LocalStack stop request completed."
		}
	}
	return models.EmulatorActionResult{
		EmulatorID: status.EmulatorID,
		Action:     action,
		State:      state,
		Summary:    summary,
		Status:     status,
	}
}

func normaliseEmulatorID(value string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return "localstack"
	}
	return value
}

package app

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"sync"
	"time"

	"cloudsprocket/backend/daemon/internal/config"
	"cloudsprocket/backend/daemon/internal/discovery"
	"cloudsprocket/backend/daemon/internal/models"
	"cloudsprocket/backend/daemon/internal/store"
)

type S3Inventory interface {
	ListBuckets(ctx context.Context, profile models.ProfileSummary) ([]models.AwsS3Bucket, error)
	ListObjects(ctx context.Context, profile models.ProfileSummary, bucketName string, prefix string) ([]models.AwsS3Object, error)
	HeadObject(ctx context.Context, profile models.ProfileSummary, bucketName string, objectKey string) ([]models.DetailField, error)
}

type Notifier interface {
	Notify(method string, payload any) error
}

type Service struct {
	settings  config.Settings
	store     *store.Store
	discovery *discovery.Service
	s3        S3Inventory
	now       func() time.Time
	mu        sync.Mutex
}

func New(
	settings config.Settings,
	store *store.Store,
	discoveryService *discovery.Service,
	s3Inventory S3Inventory,
) *Service {
	return &Service{
		settings:  settings,
		store:     store,
		discovery: discoveryService,
		s3:        s3Inventory,
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
		EC2Instances:     []models.AwsEc2Instance{},
	}

	if provider, ok := findProvider(snapshot.Providers, session.CurrentProviderID); ok {
		workspace.Provider = &provider
	}

	profiles := filterProfiles(snapshot.Profiles, session.CurrentProviderID)
	if profile, ok := findProfile(profiles, session.SelectedProfileID); ok {
		workspace.Profile = &profile
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

	return workspace
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

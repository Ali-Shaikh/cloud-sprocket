// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package app

import (
	"context"
	"encoding/json"
	"fmt"

	"cloudsprocket/backend/daemon/internal/models"
)

func (s *Service) enrichSNSInventory(
	workspace *models.WorkspaceSnapshot,
	session models.SessionSnapshot,
) {
	if workspace.Provider == nil ||
		workspace.Provider.ProviderID != "aws" ||
		workspace.Profile == nil ||
		s.sns == nil {
		return
	}
	timeoutCtx, cancel := s.withAWSTimeout(context.Background())
	workspace.SNSRegions = s.snsRegions(timeoutCtx, *workspace.Profile)
	cancel()
	workspace.SelectedSNSRegion = s.selectedSNSRegion(session, workspace.SNSRegions, *workspace.Profile)
	timeoutCtx, cancel = s.withAWSTimeout(context.Background())
	workspace.SNSTopics = s.snsTopics(timeoutCtx, *workspace.Profile, workspace.SelectedSNSRegion)
	cancel()
	workspace.SelectedSNSTopicArn = s.selectedSNSTopicArn(session, workspace.SNSTopics)
	if workspace.SelectedSNSRegion == "" {
		workspace.SNSStatusMessage = "No region is available for SNS topics in this AWS workspace."
	} else if len(workspace.SNSTopics) == 0 {
		workspace.SNSStatusMessage = fmt.Sprintf("No SNS topics were returned for %s.", workspace.SelectedSNSRegion)
	} else {
		workspace.SNSStatusMessage = fmt.Sprintf(
			"Loaded %d SNS topics from %s.",
			len(workspace.SNSTopics),
			workspace.SelectedSNSRegion,
		)
	}
	if workspace.SelectedSNSTopicArn != "" {
		timeoutCtx, cancel := s.withAWSTimeout(context.Background())
		if full, err := s.sns.DescribeTopic(timeoutCtx, *workspace.Profile, workspace.SelectedSNSRegion, workspace.SelectedSNSTopicArn); err == nil {
			for i := range workspace.SNSTopics {
				if workspace.SNSTopics[i].TopicArn == full.TopicArn {
					workspace.SNSTopics[i] = full
					break
				}
			}
		}
		cancel()
	}
}

func (s *Service) enrichRDSInventory(
	workspace *models.WorkspaceSnapshot,
	session models.SessionSnapshot,
) {
	if workspace.Provider == nil ||
		workspace.Provider.ProviderID != "aws" ||
		workspace.Profile == nil ||
		s.rds == nil {
		return
	}
	timeoutCtx, cancel := s.withAWSTimeout(context.Background())
	workspace.RDSRegions = s.rdsRegions(timeoutCtx, *workspace.Profile)
	cancel()
	workspace.SelectedRDSRegion = s.selectedRDSRegion(session, workspace.RDSRegions, *workspace.Profile)
	timeoutCtx, cancel = s.withAWSTimeout(context.Background())
	workspace.RDSInstances = s.rdsInstances(timeoutCtx, *workspace.Profile, workspace.SelectedRDSRegion)
	cancel()
	workspace.SelectedRDSInstanceID = s.selectedRDSInstanceID(session, workspace.RDSInstances)
	if workspace.SelectedRDSRegion == "" {
		workspace.RDSStatusMessage = "No region is available for RDS instances in this AWS workspace."
	} else if len(workspace.RDSInstances) == 0 {
		workspace.RDSStatusMessage = fmt.Sprintf("No RDS instances were returned for %s.", workspace.SelectedRDSRegion)
	} else {
		workspace.RDSStatusMessage = fmt.Sprintf(
			"Loaded %d RDS instances from %s.",
			len(workspace.RDSInstances),
			workspace.SelectedRDSRegion,
		)
	}
	if workspace.SelectedRDSInstanceID != "" {
		timeoutCtx, cancel := s.withAWSTimeout(context.Background())
		if full, err := s.rds.DescribeInstance(timeoutCtx, *workspace.Profile, workspace.SelectedRDSRegion, workspace.SelectedRDSInstanceID); err == nil {
			for i := range workspace.RDSInstances {
				if workspace.RDSInstances[i].DBInstanceIdentifier == full.DBInstanceIdentifier {
					workspace.RDSInstances[i] = full
					break
				}
			}
		}
		cancel()
	}
}

func (s *Service) enrichLogsInventory(
	workspace *models.WorkspaceSnapshot,
	session models.SessionSnapshot,
) {
	if workspace.Provider == nil ||
		workspace.Provider.ProviderID != "aws" ||
		workspace.Profile == nil ||
		s.logs == nil {
		return
	}
	timeoutCtx, cancel := s.withAWSTimeout(context.Background())
	workspace.LogsRegions = s.logsRegions(timeoutCtx, *workspace.Profile)
	cancel()
	workspace.SelectedLogsRegion = s.selectedLogsRegion(session, workspace.LogsRegions, *workspace.Profile)
	timeoutCtx, cancel = s.withAWSTimeout(context.Background())
	workspace.LogGroups = s.logGroups(timeoutCtx, *workspace.Profile, workspace.SelectedLogsRegion)
	cancel()
	workspace.SelectedLogGroupName = s.selectedLogGroupName(session, workspace.LogGroups)
	if workspace.SelectedLogsRegion == "" {
		workspace.LogsStatusMessage = "No region is available for CloudWatch Logs in this AWS workspace."
	} else if len(workspace.LogGroups) == 0 {
		workspace.LogsStatusMessage = fmt.Sprintf("No log groups were returned for %s.", workspace.SelectedLogsRegion)
	} else {
		workspace.LogsStatusMessage = fmt.Sprintf(
			"Loaded %d log groups from %s.",
			len(workspace.LogGroups),
			workspace.SelectedLogsRegion,
		)
	}
	if workspace.SelectedLogGroupName != "" {
		timeoutCtx, cancel := s.withAWSTimeout(context.Background())
		if full, err := s.logs.DescribeLogGroup(timeoutCtx, *workspace.Profile, workspace.SelectedLogsRegion, workspace.SelectedLogGroupName); err == nil {
			for i := range workspace.LogGroups {
				if workspace.LogGroups[i].LogGroupName == full.LogGroupName {
					workspace.LogGroups[i] = full
					break
				}
			}
		}
		cancel()
	}
}

func (s *Service) enrichIAMInventory(
	workspace *models.WorkspaceSnapshot,
	session models.SessionSnapshot,
) {
	if workspace.Provider == nil ||
		workspace.Provider.ProviderID != "aws" ||
		workspace.Profile == nil ||
		s.iam == nil {
		return
	}
	region := s.selectedIAMRegion(session, *workspace.Profile)
	timeoutCtx, cancel := s.withAWSTimeout(context.Background())
	workspace.IAMRoles = s.iamRoles(timeoutCtx, *workspace.Profile, region)
	workspace.IAMPolicies = s.iamPolicies(timeoutCtx, *workspace.Profile, region)
	cancel()
	workspace.SelectedIAMRoleName = s.selectedIAMRoleName(session, workspace.IAMRoles)
	if len(workspace.IAMRoles) == 0 && len(workspace.IAMPolicies) == 0 {
		workspace.IAMStatusMessage = "No IAM roles or customer-managed policies were returned for this AWS workspace."
	} else {
		workspace.IAMStatusMessage = fmt.Sprintf(
			"Loaded %d IAM roles and %d customer-managed policies.",
			len(workspace.IAMRoles),
			len(workspace.IAMPolicies),
		)
	}
	if workspace.SelectedIAMRoleName != "" {
		timeoutCtx, cancel := s.withAWSTimeout(context.Background())
		if full, err := s.iam.DescribeRole(timeoutCtx, *workspace.Profile, region, workspace.SelectedIAMRoleName); err == nil {
			for i := range workspace.IAMRoles {
				if workspace.IAMRoles[i].RoleName == full.RoleName {
					workspace.IAMRoles[i] = full
					break
				}
			}
		}
		cancel()
	}
}

func (s *Service) snsRegions(ctx context.Context, profile models.ProfileSummary) []string {
	return s.lambdaRegions(ctx, profile)
}

func (s *Service) selectedSNSRegion(
	session models.SessionSnapshot,
	regions []string,
	profile models.ProfileSummary,
) string {
	if session.SelectedSNSRegion != "" {
		for _, region := range regions {
			if region == session.SelectedSNSRegion {
				return session.SelectedSNSRegion
			}
		}
	}
	return s.selectedSQSRegion(session, regions, profile)
}

func (s *Service) snsTopics(
	ctx context.Context,
	profile models.ProfileSummary,
	region string,
) []models.AwsSnsTopic {
	if region == "" {
		return []models.AwsSnsTopic{}
	}
	const scope = "aws.sns.topics"
	queryHash := profile.ProfileID + "|" + region
	topics, err := s.sns.ListTopics(ctx, profile, region)
	if err == nil {
		_ = s.store.SaveResourceCache(ctx, scope, queryHash, topics, s.timestamp())
		return topics
	}
	var cached []models.AwsSnsTopic
	_, ok, cacheErr := s.store.LoadResourceCache(ctx, scope, queryHash, &cached)
	if cacheErr == nil && ok {
		return cached
	}
	return []models.AwsSnsTopic{}
}

func (s *Service) selectedSNSTopicArn(
	session models.SessionSnapshot,
	topics []models.AwsSnsTopic,
) string {
	if session.SelectedSNSTopicArn != "" {
		for _, topic := range topics {
			if topic.TopicArn == session.SelectedSNSTopicArn {
				return session.SelectedSNSTopicArn
			}
		}
	}
	if len(topics) == 0 {
		return ""
	}
	return topics[0].TopicArn
}

func (s *Service) rdsRegions(ctx context.Context, profile models.ProfileSummary) []string {
	return s.lambdaRegions(ctx, profile)
}

func (s *Service) selectedRDSRegion(
	session models.SessionSnapshot,
	regions []string,
	profile models.ProfileSummary,
) string {
	if session.SelectedRDSRegion != "" {
		for _, region := range regions {
			if region == session.SelectedRDSRegion {
				return session.SelectedRDSRegion
			}
		}
	}
	return s.selectedSQSRegion(session, regions, profile)
}

func (s *Service) rdsInstances(
	ctx context.Context,
	profile models.ProfileSummary,
	region string,
) []models.AwsRdsInstance {
	if region == "" {
		return []models.AwsRdsInstance{}
	}
	const scope = "aws.rds.instances"
	queryHash := profile.ProfileID + "|" + region
	instances, err := s.rds.ListInstances(ctx, profile, region)
	if err == nil {
		_ = s.store.SaveResourceCache(ctx, scope, queryHash, instances, s.timestamp())
		return instances
	}
	var cached []models.AwsRdsInstance
	_, ok, cacheErr := s.store.LoadResourceCache(ctx, scope, queryHash, &cached)
	if cacheErr == nil && ok {
		return cached
	}
	return []models.AwsRdsInstance{}
}

func (s *Service) selectedRDSInstanceID(
	session models.SessionSnapshot,
	instances []models.AwsRdsInstance,
) string {
	if session.SelectedRDSInstanceID != "" {
		for _, instance := range instances {
			if instance.DBInstanceIdentifier == session.SelectedRDSInstanceID {
				return session.SelectedRDSInstanceID
			}
		}
	}
	if len(instances) == 0 {
		return ""
	}
	return instances[0].DBInstanceIdentifier
}

func (s *Service) logsRegions(ctx context.Context, profile models.ProfileSummary) []string {
	return s.lambdaRegions(ctx, profile)
}

func (s *Service) selectedLogsRegion(
	session models.SessionSnapshot,
	regions []string,
	profile models.ProfileSummary,
) string {
	if session.SelectedLogsRegion != "" {
		for _, region := range regions {
			if region == session.SelectedLogsRegion {
				return session.SelectedLogsRegion
			}
		}
	}
	return s.selectedSQSRegion(session, regions, profile)
}

func (s *Service) logGroups(
	ctx context.Context,
	profile models.ProfileSummary,
	region string,
) []models.AwsLogGroup {
	if region == "" {
		return []models.AwsLogGroup{}
	}
	const scope = "aws.logs.groups"
	queryHash := profile.ProfileID + "|" + region
	groups, err := s.logs.ListLogGroups(ctx, profile, region)
	if err == nil {
		_ = s.store.SaveResourceCache(ctx, scope, queryHash, groups, s.timestamp())
		return groups
	}
	var cached []models.AwsLogGroup
	_, ok, cacheErr := s.store.LoadResourceCache(ctx, scope, queryHash, &cached)
	if cacheErr == nil && ok {
		return cached
	}
	return []models.AwsLogGroup{}
}

func (s *Service) selectedLogGroupName(
	session models.SessionSnapshot,
	groups []models.AwsLogGroup,
) string {
	if session.SelectedLogGroupName != "" {
		for _, group := range groups {
			if group.LogGroupName == session.SelectedLogGroupName {
				return session.SelectedLogGroupName
			}
		}
	}
	if len(groups) == 0 {
		return ""
	}
	return groups[0].LogGroupName
}

func (s *Service) selectedIAMRegion(session models.SessionSnapshot, profile models.ProfileSummary) string {
	if session.SelectedSQSRegion != "" {
		return session.SelectedSQSRegion
	}
	if session.SelectedLambdaRegion != "" {
		return session.SelectedLambdaRegion
	}
	return profileRegionHint(profile)
}

func (s *Service) iamRoles(
	ctx context.Context,
	profile models.ProfileSummary,
	region string,
) []models.AwsIamRole {
	const scope = "aws.iam.roles"
	queryHash := profile.ProfileID + "|" + region
	roles, err := s.iam.ListRoles(ctx, profile, region)
	if err == nil {
		_ = s.store.SaveResourceCache(ctx, scope, queryHash, roles, s.timestamp())
		return roles
	}
	var cached []models.AwsIamRole
	_, ok, cacheErr := s.store.LoadResourceCache(ctx, scope, queryHash, &cached)
	if cacheErr == nil && ok {
		return cached
	}
	return []models.AwsIamRole{}
}

func (s *Service) iamPolicies(
	ctx context.Context,
	profile models.ProfileSummary,
	region string,
) []models.AwsIamPolicy {
	const scope = "aws.iam.policies"
	queryHash := profile.ProfileID + "|" + region
	policies, err := s.iam.ListPolicies(ctx, profile, region)
	if err == nil {
		_ = s.store.SaveResourceCache(ctx, scope, queryHash, policies, s.timestamp())
		return policies
	}
	var cached []models.AwsIamPolicy
	_, ok, cacheErr := s.store.LoadResourceCache(ctx, scope, queryHash, &cached)
	if cacheErr == nil && ok {
		return cached
	}
	return []models.AwsIamPolicy{}
}

func (s *Service) selectedIAMRoleName(
	session models.SessionSnapshot,
	roles []models.AwsIamRole,
) string {
	if session.SelectedIAMRoleName != "" {
		for _, role := range roles {
			if role.RoleName == session.SelectedIAMRoleName {
				return session.SelectedIAMRoleName
			}
		}
	}
	if len(roles) == 0 {
		return ""
	}
	return roles[0].RoleName
}

func (s *Service) handleAwsSnsSelectRegion(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
	var request struct {
		Region string `json:"region"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	snapshot, session, err := s.withLockedAWSWorkspace(ctx, "open an AWS workspace before selecting an SNS region", func(session *models.SessionSnapshot) error {
		session.SelectedSNSRegion = request.Region
		session.SelectedSNSTopicArn = ""
		return nil
	})
	if err != nil {
		return nil, err
	}
	return s.finishAWSWorkspace(ctx, snapshot, session, notifier, "", "", false)
}

func (s *Service) handleAwsSnsSelectTopic(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
	var request struct {
		TopicArn string `json:"topicArn"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	snapshot, session, err := s.withLockedAWSWorkspace(ctx, "open an AWS workspace before selecting an SNS topic", func(session *models.SessionSnapshot) error {
		session.SelectedSNSTopicArn = request.TopicArn
		return nil
	})
	if err != nil {
		return nil, err
	}
	return s.finishAWSWorkspace(ctx, snapshot, session, notifier, "", "", false)
}

func (s *Service) handleAwsRdsSelectRegion(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
	var request struct {
		Region string `json:"region"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	snapshot, session, err := s.withLockedAWSWorkspace(ctx, "open an AWS workspace before selecting an RDS region", func(session *models.SessionSnapshot) error {
		session.SelectedRDSRegion = request.Region
		session.SelectedRDSInstanceID = ""
		return nil
	})
	if err != nil {
		return nil, err
	}
	return s.finishAWSWorkspace(ctx, snapshot, session, notifier, "", "", false)
}

func (s *Service) handleAwsRdsSelectInstance(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
	var request struct {
		InstanceID string `json:"instanceId"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	snapshot, session, err := s.withLockedAWSWorkspace(ctx, "open an AWS workspace before selecting an RDS instance", func(session *models.SessionSnapshot) error {
		session.SelectedRDSInstanceID = request.InstanceID
		return nil
	})
	if err != nil {
		return nil, err
	}
	return s.finishAWSWorkspace(ctx, snapshot, session, notifier, "", "", false)
}

func (s *Service) handleAwsLogsSelectRegion(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
	var request struct {
		Region string `json:"region"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	snapshot, session, err := s.withLockedAWSWorkspace(ctx, "open an AWS workspace before selecting a CloudWatch Logs region", func(session *models.SessionSnapshot) error {
		session.SelectedLogsRegion = request.Region
		session.SelectedLogGroupName = ""
		return nil
	})
	if err != nil {
		return nil, err
	}
	return s.finishAWSWorkspace(ctx, snapshot, session, notifier, "", "", false)
}

func (s *Service) handleAwsLogsSelectLogGroup(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
	var request struct {
		LogGroupName string `json:"logGroupName"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	snapshot, session, err := s.withLockedAWSWorkspace(ctx, "open an AWS workspace before selecting a log group", func(session *models.SessionSnapshot) error {
		session.SelectedLogGroupName = request.LogGroupName
		return nil
	})
	if err != nil {
		return nil, err
	}
	return s.finishAWSWorkspace(ctx, snapshot, session, notifier, "", "", false)
}

func (s *Service) handleAwsIamSelectRole(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
	var request struct {
		RoleName string `json:"roleName"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	snapshot, session, err := s.withLockedAWSWorkspace(ctx, "open an AWS workspace before selecting an IAM role", func(session *models.SessionSnapshot) error {
		session.SelectedIAMRoleName = request.RoleName
		return nil
	})
	if err != nil {
		return nil, err
	}
	return s.finishAWSWorkspace(ctx, snapshot, session, notifier, "", "", false)
}

// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package app

import (
	"context"
	"fmt"
	"sync"

	"cloudsprocket/backend/daemon/internal/models"
)

func (s *Service) enrichSNSInventory(
	workspace *models.WorkspaceSnapshot,
	session models.SessionSnapshot,
	opts awsEnrichmentOptions,
	mu *sync.Mutex,
) {
	if workspace.Provider == nil ||
		workspace.Provider.ProviderID != "aws" ||
		workspace.Profile == nil ||
		s.sns == nil {
		return
	}
	timeoutCtx, cancel := s.withAWSTimeout(context.Background())
	regions := s.snsRegions(timeoutCtx, *workspace.Profile)
	cancel()
	selectedRegion := s.selectedSNSRegion(session, regions, *workspace.Profile)

	if opts.lightweight {
		status := "No region is available for SNS topics in this AWS workspace."
		if selectedRegion != "" {
			status = fmt.Sprintf("Loaded %d region(s). Select %s to browse topics.", len(regions), selectedRegion)
		} else if len(regions) > 0 {
			status = fmt.Sprintf("Loaded %d region(s). Select a region to browse topics.", len(regions))
		}
		lockWorkspace(mu, func() {
			workspace.SNSRegions = regions
			workspace.SelectedSNSRegion = selectedRegion
			workspace.SNSTopics = []models.AwsSnsTopic{}
			workspace.SelectedSNSTopicArn = ""
			workspace.SNSStatusMessage = status
		})
		return
	}

	timeoutCtx, cancel = s.withAWSTimeout(context.Background())
	topics := s.snsTopics(timeoutCtx, *workspace.Profile, selectedRegion)
	cancel()
	selectedTopic := s.selectedSNSTopicArn(session, topics)
	if selectedTopic != "" {
		timeoutCtx, cancel := s.withAWSTimeout(context.Background())
		if full, err := s.sns.DescribeTopic(timeoutCtx, *workspace.Profile, selectedRegion, selectedTopic); err == nil {
			for i := range topics {
				if topics[i].TopicArn == full.TopicArn {
					topics[i] = full
					break
				}
			}
		}
		cancel()
	}

	status := "No region is available for SNS topics in this AWS workspace."
	if selectedRegion != "" {
		if len(topics) == 0 {
			status = fmt.Sprintf("No SNS topics were returned for %s.", selectedRegion)
		} else {
			status = fmt.Sprintf("Loaded %d SNS topics from %s.", len(topics), selectedRegion)
		}
	}

	lockWorkspace(mu, func() {
		workspace.SNSRegions = regions
		workspace.SelectedSNSRegion = selectedRegion
		workspace.SNSTopics = topics
		workspace.SelectedSNSTopicArn = selectedTopic
		workspace.SNSStatusMessage = status
	})
}

func (s *Service) enrichRDSInventory(
	workspace *models.WorkspaceSnapshot,
	session models.SessionSnapshot,
	opts awsEnrichmentOptions,
	mu *sync.Mutex,
) {
	if workspace.Provider == nil ||
		workspace.Provider.ProviderID != "aws" ||
		workspace.Profile == nil ||
		s.rds == nil {
		return
	}
	timeoutCtx, cancel := s.withAWSTimeout(context.Background())
	regions := s.rdsRegions(timeoutCtx, *workspace.Profile)
	cancel()
	selectedRegion := s.selectedRDSRegion(session, regions, *workspace.Profile)

	if opts.lightweight {
		status := "No region is available for RDS instances in this AWS workspace."
		if selectedRegion != "" {
			status = fmt.Sprintf("Loaded %d region(s). Select %s to browse instances.", len(regions), selectedRegion)
		} else if len(regions) > 0 {
			status = fmt.Sprintf("Loaded %d region(s). Select a region to browse instances.", len(regions))
		}
		lockWorkspace(mu, func() {
			workspace.RDSRegions = regions
			workspace.SelectedRDSRegion = selectedRegion
			workspace.RDSInstances = []models.AwsRdsInstance{}
			workspace.SelectedRDSInstanceID = ""
			workspace.RDSStatusMessage = status
		})
		return
	}

	timeoutCtx, cancel = s.withAWSTimeout(context.Background())
	instances := s.rdsInstances(timeoutCtx, *workspace.Profile, selectedRegion)
	cancel()
	selectedInstance := s.selectedRDSInstanceID(session, instances)
	if selectedInstance != "" {
		timeoutCtx, cancel := s.withAWSTimeout(context.Background())
		if full, err := s.rds.DescribeInstance(timeoutCtx, *workspace.Profile, selectedRegion, selectedInstance); err == nil {
			for i := range instances {
				if instances[i].DBInstanceIdentifier == full.DBInstanceIdentifier {
					instances[i] = full
					break
				}
			}
		}
		cancel()
	}

	status := "No region is available for RDS instances in this AWS workspace."
	if selectedRegion != "" {
		if len(instances) == 0 {
			status = fmt.Sprintf("No RDS instances were returned for %s.", selectedRegion)
		} else {
			status = fmt.Sprintf("Loaded %d RDS instances from %s.", len(instances), selectedRegion)
		}
	}

	lockWorkspace(mu, func() {
		workspace.RDSRegions = regions
		workspace.SelectedRDSRegion = selectedRegion
		workspace.RDSInstances = instances
		workspace.SelectedRDSInstanceID = selectedInstance
		workspace.RDSStatusMessage = status
	})
}

func (s *Service) enrichLogsInventory(
	workspace *models.WorkspaceSnapshot,
	session models.SessionSnapshot,
	opts awsEnrichmentOptions,
	mu *sync.Mutex,
) {
	if workspace.Provider == nil ||
		workspace.Provider.ProviderID != "aws" ||
		workspace.Profile == nil ||
		s.logs == nil {
		return
	}
	timeoutCtx, cancel := s.withAWSTimeout(context.Background())
	regions := s.logsRegions(timeoutCtx, *workspace.Profile)
	cancel()
	selectedRegion := s.selectedLogsRegion(session, regions, *workspace.Profile)

	if opts.lightweight {
		status := "No region is available for CloudWatch Logs in this AWS workspace."
		if selectedRegion != "" {
			status = fmt.Sprintf("Loaded %d region(s). Select %s to browse log groups.", len(regions), selectedRegion)
		} else if len(regions) > 0 {
			status = fmt.Sprintf("Loaded %d region(s). Select a region to browse log groups.", len(regions))
		}
		lockWorkspace(mu, func() {
			workspace.LogsRegions = regions
			workspace.SelectedLogsRegion = selectedRegion
			workspace.LogGroups = []models.AwsLogGroup{}
			workspace.SelectedLogGroupName = ""
			workspace.LogsStatusMessage = status
		})
		return
	}

	timeoutCtx, cancel = s.withAWSTimeout(context.Background())
	groups := s.logGroups(timeoutCtx, *workspace.Profile, selectedRegion)
	cancel()
	selectedGroup := s.selectedLogGroupName(session, groups)
	if selectedGroup != "" {
		timeoutCtx, cancel := s.withAWSTimeout(context.Background())
		if full, err := s.logs.DescribeLogGroup(timeoutCtx, *workspace.Profile, selectedRegion, selectedGroup); err == nil {
			for i := range groups {
				if groups[i].LogGroupName == full.LogGroupName {
					groups[i] = full
					break
				}
			}
		}
		cancel()
	}

	status := "No region is available for CloudWatch Logs in this AWS workspace."
	if selectedRegion != "" {
		if len(groups) == 0 {
			status = fmt.Sprintf("No log groups were returned for %s.", selectedRegion)
		} else {
			status = fmt.Sprintf("Loaded %d log groups from %s.", len(groups), selectedRegion)
		}
	}

	lockWorkspace(mu, func() {
		workspace.LogsRegions = regions
		workspace.SelectedLogsRegion = selectedRegion
		workspace.LogGroups = groups
		workspace.SelectedLogGroupName = selectedGroup
		workspace.LogsStatusMessage = status
	})
}

func (s *Service) enrichIAMInventory(
	workspace *models.WorkspaceSnapshot,
	session models.SessionSnapshot,
	opts awsEnrichmentOptions,
	mu *sync.Mutex,
) {
	if workspace.Provider == nil ||
		workspace.Provider.ProviderID != "aws" ||
		workspace.Profile == nil ||
		s.iam == nil {
		return
	}
	region := s.selectedIAMRegion(session, *workspace.Profile)

	if opts.lightweight {
		lockWorkspace(mu, func() {
			workspace.IAMRoles = []models.AwsIamRole{}
			workspace.IAMPolicies = []models.AwsIamPolicy{}
			workspace.SelectedIAMRoleName = ""
			workspace.IAMStatusMessage = "Select an IAM role to load roles and policies."
		})
		return
	}

	timeoutCtx, cancel := s.withAWSTimeout(context.Background())
	roles := s.iamRoles(timeoutCtx, *workspace.Profile, region)
	policies := s.iamPolicies(timeoutCtx, *workspace.Profile, region)
	cancel()
	selectedRole := s.selectedIAMRoleName(session, roles)
	if selectedRole != "" {
		timeoutCtx, cancel := s.withAWSTimeout(context.Background())
		if full, err := s.iam.DescribeRole(timeoutCtx, *workspace.Profile, region, selectedRole); err == nil {
			for i := range roles {
				if roles[i].RoleName == full.RoleName {
					roles[i] = full
					break
				}
			}
		}
		cancel()
	}

	status := "No IAM roles or customer-managed policies were returned for this AWS workspace."
	if len(roles) > 0 || len(policies) > 0 {
		status = fmt.Sprintf(
			"Loaded %d IAM roles and %d customer-managed policies.",
			len(roles),
			len(policies),
		)
	}

	lockWorkspace(mu, func() {
		workspace.IAMRoles = roles
		workspace.IAMPolicies = policies
		workspace.SelectedIAMRoleName = selectedRole
		workspace.IAMStatusMessage = status
	})
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

	var cached []models.AwsSnsTopic
	if _, ok, _ := s.loadCachedResource(ctx, scope, queryHash, &cached); ok {
		return cached
	}

	topics, err := s.sns.ListTopics(ctx, profile, region)
	if err == nil {
		_ = s.saveResourceCacheWithTTL(ctx, scope, queryHash, topics)
		return topics
	}
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

	var cached []models.AwsRdsInstance
	if _, ok, _ := s.loadCachedResource(ctx, scope, queryHash, &cached); ok {
		return cached
	}

	instances, err := s.rds.ListInstances(ctx, profile, region)
	if err == nil {
		_ = s.saveResourceCacheWithTTL(ctx, scope, queryHash, instances)
		return instances
	}
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

	var cached []models.AwsLogGroup
	if _, ok, _ := s.loadCachedResource(ctx, scope, queryHash, &cached); ok {
		return cached
	}

	groups, err := s.logs.ListLogGroups(ctx, profile, region)
	if err == nil {
		_ = s.saveResourceCacheWithTTL(ctx, scope, queryHash, groups)
		return groups
	}
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

	var cached []models.AwsIamRole
	if _, ok, _ := s.loadCachedResource(ctx, scope, queryHash, &cached); ok {
		return cached
	}

	roles, err := s.iam.ListRoles(ctx, profile, region)
	if err == nil {
		_ = s.saveResourceCacheWithTTL(ctx, scope, queryHash, roles)
		return roles
	}
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

	var cached []models.AwsIamPolicy
	if _, ok, _ := s.loadCachedResource(ctx, scope, queryHash, &cached); ok {
		return cached
	}

	policies, err := s.iam.ListPolicies(ctx, profile, region)
	if err == nil {
		_ = s.saveResourceCacheWithTTL(ctx, scope, queryHash, policies)
		return policies
	}
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

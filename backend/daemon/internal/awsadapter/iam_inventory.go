// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package awsadapter

import (
	"context"
	"fmt"
	"sort"
	"strings"

	"github.com/aws/aws-sdk-go-v2/aws"
	awscfg "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/iam"
	"github.com/aws/aws-sdk-go-v2/service/iam/types"

	"cloudsprocket/backend/daemon/internal/config"
	"cloudsprocket/backend/daemon/internal/models"
)

// IAMInventory provides read-only IAM role and customer-managed policy inventory.
type IAMInventory struct {
	settings config.Settings
}

func NewIAMInventory(settings config.Settings) *IAMInventory {
	return &IAMInventory{settings: settings}
}

func (i *IAMInventory) ListRoles(
	ctx context.Context,
	profile models.ProfileSummary,
	region string,
) ([]models.AwsIamRole, error) {
	cfg, err := i.loadConfig(ctx, profile, region)
	if err != nil {
		return nil, err
	}

	client := iamClient(cfg, profile)
	paginator := iam.NewListRolesPaginator(client, &iam.ListRolesInput{})
	roles := []models.AwsIamRole{}
	for paginator.HasMorePages() {
		page, err := paginator.NextPage(ctx)
		if err != nil {
			return nil, err
		}
		for _, role := range page.Roles {
			roles = append(roles, iamRoleSummary(role))
		}
	}
	sort.SliceStable(roles, func(a, b int) bool {
		return roles[a].RoleName < roles[b].RoleName
	})
	return roles, nil
}

func (i *IAMInventory) DescribeRole(
	ctx context.Context,
	profile models.ProfileSummary,
	region string,
	roleName string,
) (models.AwsIamRole, error) {
	roleName = strings.TrimSpace(roleName)
	if roleName == "" {
		return models.AwsIamRole{}, fmt.Errorf("role name is required")
	}
	cfg, err := i.loadConfig(ctx, profile, region)
	if err != nil {
		return models.AwsIamRole{}, err
	}

	client := iamClient(cfg, profile)
	getOut, err := client.GetRole(ctx, &iam.GetRoleInput{
		RoleName: aws.String(roleName),
	})
	if err != nil {
		return models.AwsIamRole{}, err
	}
	role := iamRoleSummary(*getOut.Role)

	policyPaginator := iam.NewListAttachedRolePoliciesPaginator(client, &iam.ListAttachedRolePoliciesInput{
		RoleName: aws.String(roleName),
	})
	for policyPaginator.HasMorePages() {
		page, err := policyPaginator.NextPage(ctx)
		if err != nil {
			return role, err
		}
		for _, policy := range page.AttachedPolicies {
			role.AttachedPolicies = append(role.AttachedPolicies, awsString(policy.PolicyName))
		}
	}
	sort.Strings(role.AttachedPolicies)
	return role, nil
}

func (i *IAMInventory) ListPolicies(
	ctx context.Context,
	profile models.ProfileSummary,
	region string,
) ([]models.AwsIamPolicy, error) {
	cfg, err := i.loadConfig(ctx, profile, region)
	if err != nil {
		return nil, err
	}

	client := iamClient(cfg, profile)
	paginator := iam.NewListPoliciesPaginator(client, &iam.ListPoliciesInput{
		Scope: types.PolicyScopeTypeLocal,
	})
	policies := []models.AwsIamPolicy{}
	for paginator.HasMorePages() {
		page, err := paginator.NextPage(ctx)
		if err != nil {
			return nil, err
		}
		for _, policy := range page.Policies {
			policies = append(policies, iamPolicySummary(policy))
		}
	}
	sort.SliceStable(policies, func(a, b int) bool {
		return policies[a].PolicyName < policies[b].PolicyName
	})
	return policies, nil
}

func (i *IAMInventory) loadConfig(
	ctx context.Context,
	profile models.ProfileSummary,
	region string,
) (aws.Config, error) {
	if region == "" {
		region = awsRegionHint(profile)
	}
	return awscfg.LoadDefaultConfig(
		ctx,
		awscfg.WithSharedConfigProfile(profile.ProfileID),
		awscfg.WithSharedConfigFiles([]string{i.settings.AWSConfigPath}),
		awscfg.WithSharedCredentialsFiles([]string{i.settings.AWSCredentialsPath}),
		awscfg.WithRegion(region),
	)
}

func iamRoleSummary(role types.Role) models.AwsIamRole {
	summary := models.AwsIamRole{
		RoleName:    awsString(role.RoleName),
		RoleArn:     awsString(role.Arn),
		Path:        awsString(role.Path),
		Description: awsString(role.Description),
	}
	if role.CreateDate != nil {
		summary.CreateDate = role.CreateDate.UTC().Format("2006-01-02T15:04:05Z")
	}
	return summary
}

func iamPolicySummary(policy types.Policy) models.AwsIamPolicy {
	summary := models.AwsIamPolicy{
		PolicyName: awsString(policy.PolicyName),
		PolicyArn:  awsString(policy.Arn),
	}
	if policy.AttachmentCount != nil {
		summary.AttachmentCount = *policy.AttachmentCount
	}
	if policy.UpdateDate != nil {
		summary.UpdateDate = policy.UpdateDate.UTC().Format("2006-01-02T15:04:05Z")
	}
	return summary
}
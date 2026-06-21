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
	"github.com/aws/aws-sdk-go-v2/service/rds"
	"github.com/aws/aws-sdk-go-v2/service/rds/types"

	"cloudsprocket/backend/daemon/internal/config"
	"cloudsprocket/backend/daemon/internal/models"
)

// RDSInventory provides read-only inventory for RDS DB instances.
type RDSInventory struct {
	settings config.Settings
}

func NewRDSInventory(settings config.Settings) *RDSInventory {
	return &RDSInventory{settings: settings}
}

func (r *RDSInventory) ListInstances(
	ctx context.Context,
	profile models.ProfileSummary,
	region string,
) ([]models.AwsRdsInstance, error) {
	if region == "" {
		region = awsRegionHint(profile)
	}
	cfg, err := r.loadConfig(ctx, profile, region)
	if err != nil {
		return nil, err
	}

	client := rdsClient(cfg, profile)
	paginator := rds.NewDescribeDBInstancesPaginator(client, &rds.DescribeDBInstancesInput{})
	instances := []models.AwsRdsInstance{}
	for paginator.HasMorePages() {
		page, err := paginator.NextPage(ctx)
		if err != nil {
			return nil, err
		}
		for _, instance := range page.DBInstances {
			instances = append(instances, rdsInstanceSummary(instance))
		}
	}
	sort.SliceStable(instances, func(i, j int) bool {
		return instances[i].DBInstanceIdentifier < instances[j].DBInstanceIdentifier
	})
	return instances, nil
}

func (r *RDSInventory) DescribeInstance(
	ctx context.Context,
	profile models.ProfileSummary,
	region string,
	instanceID string,
) (models.AwsRdsInstance, error) {
	instanceID = strings.TrimSpace(instanceID)
	if instanceID == "" {
		return models.AwsRdsInstance{}, fmt.Errorf("DB instance identifier is required")
	}
	if region == "" {
		region = awsRegionHint(profile)
	}
	cfg, err := r.loadConfig(ctx, profile, region)
	if err != nil {
		return models.AwsRdsInstance{}, err
	}

	client := rdsClient(cfg, profile)
	res, err := client.DescribeDBInstances(ctx, &rds.DescribeDBInstancesInput{
		DBInstanceIdentifier: aws.String(instanceID),
	})
	if err != nil {
		return models.AwsRdsInstance{}, err
	}
	if len(res.DBInstances) == 0 {
		return models.AwsRdsInstance{}, fmt.Errorf("DB instance %s was not found", instanceID)
	}
	return rdsInstanceSummary(res.DBInstances[0]), nil
}

func (r *RDSInventory) loadConfig(
	ctx context.Context,
	profile models.ProfileSummary,
	region string,
) (aws.Config, error) {
	return awscfg.LoadDefaultConfig(
		ctx,
		awscfg.WithSharedConfigProfile(profile.ProfileID),
		awscfg.WithSharedConfigFiles([]string{r.settings.AWSConfigPath}),
		awscfg.WithSharedCredentialsFiles([]string{r.settings.AWSCredentialsPath}),
		awscfg.WithRegion(region),
	)
}

func rdsClient(cfg aws.Config, profile models.ProfileSummary) *rds.Client {
	return rds.NewFromConfig(cfg, func(options *rds.Options) {
		if endpointURL := awsEndpointURL(profile); endpointURL != "" {
			options.BaseEndpoint = aws.String(endpointURL)
		}
	})
}

func rdsInstanceSummary(instance types.DBInstance) models.AwsRdsInstance {
	summary := models.AwsRdsInstance{
		DBInstanceIdentifier: awsString(instance.DBInstanceIdentifier),
		Engine:               awsString(instance.Engine),
		EngineVersion:        awsString(instance.EngineVersion),
		Status:               awsString(instance.DBInstanceStatus),
		InstanceClass:        awsString(instance.DBInstanceClass),
		AvailabilityZone:     awsString(instance.AvailabilityZone),
		MultiAZ:              boolValue(instance.MultiAZ),
		StorageEncrypted:     boolValue(instance.StorageEncrypted),
	}
	if instance.AllocatedStorage != nil {
		summary.AllocatedStorage = *instance.AllocatedStorage
	}
	if instance.Endpoint != nil {
		summary.EndpointAddress = awsString(instance.Endpoint.Address)
		if instance.Endpoint.Port != nil {
			summary.EndpointPort = *instance.Endpoint.Port
		}
	}
	if summary.EndpointAddress != "" && summary.EndpointPort > 0 {
		summary.Endpoint = fmt.Sprintf("%s:%d", summary.EndpointAddress, summary.EndpointPort)
	} else if summary.EndpointAddress != "" {
		summary.Endpoint = summary.EndpointAddress
	}
	return summary
}
package awsadapter

import (
	"context"
	"fmt"
	"sort"

	"github.com/aws/aws-sdk-go-v2/aws"
	awscfg "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/ec2"
	"github.com/aws/aws-sdk-go-v2/service/ec2/types"

	"cloudsprocket/backend/daemon/internal/config"
	"cloudsprocket/backend/daemon/internal/models"
)

type EC2Inventory struct {
	settings config.Settings
}

func NewEC2Inventory(settings config.Settings) *EC2Inventory {
	return &EC2Inventory{settings: settings}
}

func (e *EC2Inventory) ListRegions(ctx context.Context, profile models.ProfileSummary) ([]string, error) {
	cfg, err := e.loadConfig(ctx, profile, awsRegionHint(profile))
	if err != nil {
		return nil, err
	}

	result, err := ec2.NewFromConfig(cfg).DescribeRegions(ctx, &ec2.DescribeRegionsInput{
		AllRegions: aws.Bool(false),
	})
	if err != nil {
		return nil, err
	}

	regions := make([]string, 0, len(result.Regions))
	for _, region := range result.Regions {
		name := awsString(region.RegionName)
		if name == "" || awsString(region.OptInStatus) == "not-opted-in" {
			continue
		}
		regions = append(regions, name)
	}
	sort.Strings(regions)
	return regions, nil
}

func (e *EC2Inventory) ListInstances(
	ctx context.Context,
	profile models.ProfileSummary,
	region string,
) ([]models.AwsEc2Instance, error) {
	if region == "" {
		region = awsRegionHint(profile)
	}
	cfg, err := e.loadConfig(ctx, profile, region)
	if err != nil {
		return nil, err
	}

	client := ec2.NewFromConfig(cfg)
	paginator := ec2.NewDescribeInstancesPaginator(client, &ec2.DescribeInstancesInput{})
	instances := []models.AwsEc2Instance{}
	for paginator.HasMorePages() {
		page, err := paginator.NextPage(ctx)
		if err != nil {
			return nil, err
		}
		for _, reservation := range page.Reservations {
			for _, instance := range reservation.Instances {
				instances = append(instances, ec2InstanceSummary(instance))
			}
		}
	}
	sort.SliceStable(instances, func(left int, right int) bool {
		if instances[left].Name != instances[right].Name {
			return instances[left].Name < instances[right].Name
		}
		return instances[left].InstanceID < instances[right].InstanceID
	})
	return instances, nil
}

func (e *EC2Inventory) StartInstance(ctx context.Context, profile models.ProfileSummary, region string, instanceID string) error {
	if instanceID == "" {
		return fmt.Errorf("instance id is required")
	}
	client, err := e.client(ctx, profile, region)
	if err != nil {
		return err
	}
	_, err = client.StartInstances(ctx, &ec2.StartInstancesInput{InstanceIds: []string{instanceID}})
	return err
}

func (e *EC2Inventory) StopInstance(ctx context.Context, profile models.ProfileSummary, region string, instanceID string) error {
	if instanceID == "" {
		return fmt.Errorf("instance id is required")
	}
	client, err := e.client(ctx, profile, region)
	if err != nil {
		return err
	}
	_, err = client.StopInstances(ctx, &ec2.StopInstancesInput{InstanceIds: []string{instanceID}})
	return err
}

func (e *EC2Inventory) RebootInstance(ctx context.Context, profile models.ProfileSummary, region string, instanceID string) error {
	if instanceID == "" {
		return fmt.Errorf("instance id is required")
	}
	client, err := e.client(ctx, profile, region)
	if err != nil {
		return err
	}
	_, err = client.RebootInstances(ctx, &ec2.RebootInstancesInput{InstanceIds: []string{instanceID}})
	return err
}

func (e *EC2Inventory) client(ctx context.Context, profile models.ProfileSummary, region string) (*ec2.Client, error) {
	if region == "" {
		region = awsRegionHint(profile)
	}
	cfg, err := e.loadConfig(ctx, profile, region)
	if err != nil {
		return nil, err
	}
	return ec2.NewFromConfig(cfg), nil
}

func (e *EC2Inventory) loadConfig(ctx context.Context, profile models.ProfileSummary, region string) (aws.Config, error) {
	return awscfg.LoadDefaultConfig(
		ctx,
		awscfg.WithSharedConfigProfile(profile.ProfileID),
		awscfg.WithSharedConfigFiles([]string{e.settings.AWSConfigPath}),
		awscfg.WithSharedCredentialsFiles([]string{e.settings.AWSCredentialsPath}),
		awscfg.WithRegion(region),
	)
}

func ec2InstanceSummary(instance types.Instance) models.AwsEc2Instance {
	summary := models.AwsEc2Instance{
		InstanceID:       awsString(instance.InstanceId),
		Name:             ec2Name(instance.Tags),
		State:            string(instance.State.Name),
		InstanceType:     string(instance.InstanceType),
		PublicIP:         awsString(instance.PublicIpAddress),
		PrivateIP:        awsString(instance.PrivateIpAddress),
		AvailabilityZone: awsString(instance.Placement.AvailabilityZone),
	}
	if summary.Name == "" {
		summary.Name = summary.InstanceID
	}
	return summary
}

func ec2Name(tags []types.Tag) string {
	for _, tag := range tags {
		if awsString(tag.Key) == "Name" {
			return awsString(tag.Value)
		}
	}
	return ""
}

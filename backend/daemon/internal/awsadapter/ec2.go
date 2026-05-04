package awsadapter

import (
	"context"
	"fmt"
	"sort"
	"time"

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

	result, err := ec2Client(cfg, profile).DescribeRegions(ctx, &ec2.DescribeRegionsInput{
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

	client := ec2Client(cfg, profile)
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
	return ec2Client(cfg, profile), nil
}

func ec2Client(cfg aws.Config, profile models.ProfileSummary) *ec2.Client {
	return ec2.NewFromConfig(cfg, func(options *ec2.Options) {
		if endpointURL := awsEndpointURL(profile); endpointURL != "" {
			options.BaseEndpoint = aws.String(endpointURL)
		}
	})
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
		VpcID:            awsString(instance.VpcId),
		SubnetID:         awsString(instance.SubnetId),
		KeyName:          awsString(instance.KeyName),
		PlatformDetails:  awsString(instance.PlatformDetails),
		Architecture:     string(instance.Architecture),
		SecurityGroups:   ec2SecurityGroups(instance.SecurityGroups),
		Tags:             ec2Tags(instance.Tags),
	}
	if instance.LaunchTime != nil {
		summary.LaunchTime = instance.LaunchTime.UTC().Format(time.RFC3339)
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

func ec2SecurityGroups(groups []types.GroupIdentifier) []string {
	values := make([]string, 0, len(groups))
	for _, group := range groups {
		groupID := awsString(group.GroupId)
		groupName := awsString(group.GroupName)
		if groupName != "" && groupID != "" {
			values = append(values, fmt.Sprintf("%s (%s)", groupName, groupID))
			continue
		}
		if groupID != "" {
			values = append(values, groupID)
			continue
		}
		if groupName != "" {
			values = append(values, groupName)
		}
	}
	sort.Strings(values)
	return values
}

func ec2Tags(tags []types.Tag) []models.DetailField {
	values := make([]models.DetailField, 0, len(tags))
	for _, tag := range tags {
		key := awsString(tag.Key)
		if key == "" {
			continue
		}
		values = append(values, models.DetailField{
			Label: key,
			Value: awsString(tag.Value),
		})
	}
	sort.SliceStable(values, func(left int, right int) bool {
		return values[left].Label < values[right].Label
	})
	return values
}

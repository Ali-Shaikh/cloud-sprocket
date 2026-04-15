package awsadapter

import (
	"context"
	"time"

	awscfg "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/dustin/go-humanize"

	"cloudsprocket/backend/daemon/internal/config"
	"cloudsprocket/backend/daemon/internal/models"
)

type S3Inventory struct {
	settings config.Settings
}

func NewS3Inventory(settings config.Settings) *S3Inventory {
	return &S3Inventory{settings: settings}
}

func (s *S3Inventory) ListBuckets(
	ctx context.Context,
	profile models.ProfileSummary,
) ([]models.AwsS3Bucket, error) {
	region := awsRegion(profile)
	if region == "" {
		region = "us-east-1"
	}

	cfg, err := awscfg.LoadDefaultConfig(
		ctx,
		awscfg.WithSharedConfigProfile(profile.ProfileID),
		awscfg.WithSharedConfigFiles([]string{s.settings.AWSConfigPath}),
		awscfg.WithSharedCredentialsFiles([]string{s.settings.AWSCredentialsPath}),
		awscfg.WithRegion(region),
	)
	if err != nil {
		return nil, err
	}

	client := s3.NewFromConfig(cfg)
	result, err := client.ListBuckets(ctx, &s3.ListBucketsInput{})
	if err != nil {
		return nil, err
	}

	buckets := make([]models.AwsS3Bucket, 0, len(result.Buckets))
	for _, bucket := range result.Buckets {
		entry := models.AwsS3Bucket{
			Name: awsString(bucket.Name),
		}
		if bucket.CreationDate != nil {
			entry.CreatedAt = bucket.CreationDate.UTC().Format(time.RFC3339)
		}
		if region != "" {
			entry.Summary = "Profile region " + region
		}
		buckets = append(buckets, entry)
	}

	return buckets, nil
}

func (s *S3Inventory) ListObjects(
	ctx context.Context,
	profile models.ProfileSummary,
	bucketName string,
) ([]models.AwsS3Object, error) {
	region := awsRegion(profile)
	if region == "" {
		region = "us-east-1"
	}

	cfg, err := awscfg.LoadDefaultConfig(
		ctx,
		awscfg.WithSharedConfigProfile(profile.ProfileID),
		awscfg.WithSharedConfigFiles([]string{s.settings.AWSConfigPath}),
		awscfg.WithSharedCredentialsFiles([]string{s.settings.AWSCredentialsPath}),
		awscfg.WithRegion(region),
	)
	if err != nil {
		return nil, err
	}

	client := s3.NewFromConfig(cfg)
	result, err := client.ListObjectsV2(ctx, &s3.ListObjectsV2Input{
		Bucket: &bucketName,
	})
	if err != nil {
		return nil, err
	}

	objects := make([]models.AwsS3Object, 0, len(result.Contents))
	for _, object := range result.Contents {
		entry := models.AwsS3Object{
			Key:          awsString(object.Key),
			StorageClass: string(object.StorageClass),
		}
		if object.LastModified != nil {
			entry.ModifiedAt = object.LastModified.UTC().Format(time.RFC3339)
		}
		if object.Size != nil && *object.Size > 0 {
			entry.Size = humanize.Bytes(uint64(*object.Size))
		}
		objects = append(objects, entry)
	}

	return objects, nil
}

func awsRegion(profile models.ProfileSummary) string {
	for _, field := range profile.Attributes {
		if field.Label == "Region" && field.Value != "" {
			return field.Value
		}
	}
	return ""
}

func awsString(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}

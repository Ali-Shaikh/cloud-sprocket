package awsadapter

import (
	"context"
	"sort"
	"sync"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	awscfg "github.com/aws/aws-sdk-go-v2/config"
	s3manager "github.com/aws/aws-sdk-go-v2/feature/s3/manager"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/dustin/go-humanize"

	"cloudsprocket/backend/daemon/internal/config"
	"cloudsprocket/backend/daemon/internal/models"
)

type S3Inventory struct {
	settings      config.Settings
	mu            sync.Mutex
	bucketRegions map[string]string
}

const maxObjectListingPages = 5

func NewS3Inventory(settings config.Settings) *S3Inventory {
	return &S3Inventory{
		settings:      settings,
		bucketRegions: map[string]string{},
	}
}

func (s *S3Inventory) ListBuckets(
	ctx context.Context,
	profile models.ProfileSummary,
) ([]models.AwsS3Bucket, error) {
	region := awsRegionHint(profile)
	cfg, err := s.loadConfig(ctx, profile, region)
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
	prefix string,
) ([]models.AwsS3Object, error) {
	region, err := s.bucketRegion(ctx, profile, bucketName)
	if err != nil {
		return nil, err
	}

	cfg, err := s.loadConfig(ctx, profile, region)
	if err != nil {
		return nil, err
	}

	client := s3.NewFromConfig(cfg)
	input := &s3.ListObjectsV2Input{
		Bucket: &bucketName,
	}
	if prefix != "" {
		input.Prefix = &prefix
	}

	paginator := s3.NewListObjectsV2Paginator(client, input)
	objects := []models.AwsS3Object{}
	for pagesRead := 0; paginator.HasMorePages() && pagesRead < maxObjectListingPages; pagesRead++ {
		result, err := paginator.NextPage(ctx)
		if err != nil {
			return nil, err
		}

		for _, object := range result.Contents {
			entry := models.AwsS3Object{
				Key:          awsString(object.Key),
				StorageClass: string(object.StorageClass),
			}
			if object.LastModified != nil {
				entry.ModifiedAt = object.LastModified.UTC().Format(time.RFC3339)
			}
			if object.Size != nil {
				entry.Size = humanize.Bytes(uint64(*object.Size))
			}
			objects = append(objects, entry)
		}
	}

	return objects, nil
}

func (s *S3Inventory) HeadObject(
	ctx context.Context,
	profile models.ProfileSummary,
	bucketName string,
	objectKey string,
) ([]models.DetailField, error) {
	region, err := s.bucketRegion(ctx, profile, bucketName)
	if err != nil {
		return nil, err
	}

	cfg, err := s.loadConfig(ctx, profile, region)
	if err != nil {
		return nil, err
	}

	client := s3.NewFromConfig(cfg)
	result, err := client.HeadObject(ctx, &s3.HeadObjectInput{
		Bucket: &bucketName,
		Key:    &objectKey,
	})
	if err != nil {
		return nil, err
	}

	fields := []models.DetailField{
		{Label: "Bucket", Value: bucketName},
		{Label: "Key", Value: objectKey},
		{Label: "Region", Value: region},
	}
	if result.ContentLength != nil {
		fields = append(fields, models.DetailField{
			Label: "Size",
			Value: humanize.Bytes(uint64(*result.ContentLength)),
		})
	}
	if result.LastModified != nil {
		fields = append(fields, models.DetailField{
			Label: "Last Modified",
			Value: result.LastModified.UTC().Format(time.RFC3339),
		})
	}
	if result.ContentType != nil && *result.ContentType != "" {
		fields = append(fields, models.DetailField{
			Label: "Content Type",
			Value: *result.ContentType,
		})
	}
	if result.ETag != nil && *result.ETag != "" {
		fields = append(fields, models.DetailField{
			Label: "ETag",
			Value: *result.ETag,
		})
	}
	if result.StorageClass != "" {
		fields = append(fields, models.DetailField{
			Label: "Storage Class",
			Value: string(result.StorageClass),
		})
	}
	metadataKeys := make([]string, 0, len(result.Metadata))
	for key := range result.Metadata {
		metadataKeys = append(metadataKeys, key)
	}
	sort.Strings(metadataKeys)
	for _, key := range metadataKeys {
		value := result.Metadata[key]
		if value == "" {
			continue
		}
		fields = append(fields, models.DetailField{
			Label: "Metadata: " + key,
			Value: value,
		})
	}
	return fields, nil
}

func (s *S3Inventory) bucketRegion(
	ctx context.Context,
	profile models.ProfileSummary,
	bucketName string,
) (string, error) {
	s.mu.Lock()
	cachedRegion := s.bucketRegions[bucketName]
	s.mu.Unlock()
	if cachedRegion != "" {
		return cachedRegion, nil
	}

	cfg, err := s.loadConfig(ctx, profile, awsRegionHint(profile))
	if err != nil {
		return "", err
	}

	region, err := s3manager.GetBucketRegion(ctx, s3.NewFromConfig(cfg), bucketName)
	if err != nil {
		return "", err
	}

	s.mu.Lock()
	s.bucketRegions[bucketName] = region
	s.mu.Unlock()

	return region, nil
}

func (s *S3Inventory) loadConfig(
	ctx context.Context,
	profile models.ProfileSummary,
	region string,
) (aws.Config, error) {
	return awscfg.LoadDefaultConfig(
		ctx,
		awscfg.WithSharedConfigProfile(profile.ProfileID),
		awscfg.WithSharedConfigFiles([]string{s.settings.AWSConfigPath}),
		awscfg.WithSharedCredentialsFiles([]string{s.settings.AWSCredentialsPath}),
		awscfg.WithRegion(region),
	)
}

func awsRegionHint(profile models.ProfileSummary) string {
	for _, field := range profile.Attributes {
		if field.Label == "Region" && field.Value != "" {
			return field.Value
		}
	}
	return "us-east-1"
}

func awsString(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}

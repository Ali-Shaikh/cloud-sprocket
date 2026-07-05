// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package awsadapter

import (
	"context"
	"fmt"
	"os"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	s3manager "github.com/aws/aws-sdk-go-v2/feature/s3/manager"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/aws/aws-sdk-go-v2/service/s3/types"
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

	client := s3Client(cfg, profile)
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

	client := s3Client(cfg, profile)
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

	client := s3Client(cfg, profile)
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
	appendStringField := func(label string, value *string) {
		if value != nil && *value != "" {
			fields = append(fields, models.DetailField{Label: label, Value: *value})
		}
	}
	appendBoolField := func(label string, value *bool) {
		if value != nil {
			if *value {
				fields = append(fields, models.DetailField{Label: label, Value: "true"})
			} else {
				fields = append(fields, models.DetailField{Label: label, Value: "false"})
			}
		}
	}
	appendStringField("Cache Control", result.CacheControl)
	appendStringField("Content Disposition", result.ContentDisposition)
	appendStringField("Content Encoding", result.ContentEncoding)
	appendStringField("Content Language", result.ContentLanguage)
	if result.ETag != nil && *result.ETag != "" {
		fields = append(fields, models.DetailField{
			Label: "ETag",
			Value: *result.ETag,
		})
	}
	appendStringField("Checksum CRC32", result.ChecksumCRC32)
	appendStringField("Checksum CRC32C", result.ChecksumCRC32C)
	appendStringField("Checksum CRC64NVME", result.ChecksumCRC64NVME)
	appendStringField("Checksum SHA1", result.ChecksumSHA1)
	appendStringField("Checksum SHA256", result.ChecksumSHA256)
	if result.ChecksumType != "" {
		fields = append(fields, models.DetailField{Label: "Checksum Type", Value: string(result.ChecksumType)})
	}
	if result.StorageClass != "" {
		fields = append(fields, models.DetailField{
			Label: "Storage Class",
			Value: string(result.StorageClass),
		})
	}
	if result.ServerSideEncryption != "" {
		fields = append(fields, models.DetailField{Label: "Server Side Encryption", Value: string(result.ServerSideEncryption)})
	}
	if result.SSEKMSKeyId != nil && *result.SSEKMSKeyId != "" {
		fields = append(fields, models.DetailField{Label: "SSE KMS Key ID", Value: *result.SSEKMSKeyId, Sensitive: true})
	}
	appendBoolField("Bucket Key Enabled", result.BucketKeyEnabled)
	if result.ReplicationStatus != "" {
		fields = append(fields, models.DetailField{Label: "Replication Status", Value: string(result.ReplicationStatus)})
	}
	appendStringField("Expiration", result.Expiration)
	appendStringField("Restore", result.Restore)
	if result.ObjectLockMode != "" {
		fields = append(fields, models.DetailField{Label: "Object Lock Mode", Value: string(result.ObjectLockMode)})
	}
	if result.ObjectLockLegalHoldStatus != "" {
		fields = append(fields, models.DetailField{Label: "Object Lock Legal Hold", Value: string(result.ObjectLockLegalHoldStatus)})
	}
	if result.ObjectLockRetainUntilDate != nil {
		fields = append(fields, models.DetailField{Label: "Object Lock Retain Until", Value: result.ObjectLockRetainUntilDate.UTC().Format(time.RFC3339)})
	}
	if result.PartsCount != nil {
		fields = append(fields, models.DetailField{Label: "Multipart Parts", Value: fmt.Sprintf("%d", *result.PartsCount)})
	}
	if result.MissingMeta != nil && *result.MissingMeta > 0 {
		fields = append(fields, models.DetailField{Label: "Missing Metadata Entries", Value: fmt.Sprintf("%d", *result.MissingMeta)})
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

func (s *S3Inventory) UploadFile(
	ctx context.Context,
	profile models.ProfileSummary,
	bucketName string,
	objectKey string,
	sourcePath string,
) (models.AwsS3UploadResult, error) {
	if bucketName == "" || objectKey == "" || sourcePath == "" {
		return models.AwsS3UploadResult{}, fmt.Errorf("bucket, object key, and source path are required")
	}

	source, err := os.Open(sourcePath)
	if err != nil {
		return models.AwsS3UploadResult{}, err
	}
	defer source.Close()

	info, err := source.Stat()
	if err != nil {
		return models.AwsS3UploadResult{}, err
	}
	if info.IsDir() {
		return models.AwsS3UploadResult{}, fmt.Errorf("source path must be a file")
	}

	region, err := s.bucketRegion(ctx, profile, bucketName)
	if err != nil {
		return models.AwsS3UploadResult{}, err
	}

	cfg, err := s.loadConfig(ctx, profile, region)
	if err != nil {
		return models.AwsS3UploadResult{}, err
	}

	client := s3Client(cfg, profile)
	uploader := s3manager.NewUploader(client)
	_, err = uploader.Upload(ctx, &s3.PutObjectInput{
		Bucket: aws.String(bucketName),
		Key:    aws.String(objectKey),
		Body:   source,
	})
	if err != nil {
		return models.AwsS3UploadResult{}, err
	}

	_, _ = client.HeadObject(ctx, &s3.HeadObjectInput{
		Bucket: aws.String(bucketName),
		Key:    aws.String(objectKey),
	})

	return models.AwsS3UploadResult{
		BucketName:     bucketName,
		ObjectKey:      objectKey,
		DestinationURI: fmt.Sprintf("s3://%s/%s", bucketName, objectKey),
	}, nil
}

func (s *S3Inventory) DeleteObject(
	ctx context.Context,
	profile models.ProfileSummary,
	bucketName string,
	objectKey string,
) (models.AwsS3DeleteObjectResult, error) {
	if bucketName == "" || objectKey == "" {
		return models.AwsS3DeleteObjectResult{}, fmt.Errorf("bucket and object key are required")
	}
	region, err := s.bucketRegion(ctx, profile, bucketName)
	if err != nil {
		return models.AwsS3DeleteObjectResult{}, err
	}
	cfg, err := s.loadConfig(ctx, profile, region)
	if err != nil {
		return models.AwsS3DeleteObjectResult{}, err
	}
	client := s3Client(cfg, profile)
	_, err = client.DeleteObject(ctx, &s3.DeleteObjectInput{
		Bucket: aws.String(bucketName),
		Key:    aws.String(objectKey),
	})
	if err != nil {
		return models.AwsS3DeleteObjectResult{}, err
	}
	return models.AwsS3DeleteObjectResult{
		BucketName: bucketName,
		ObjectKey:  objectKey,
		Summary:    fmt.Sprintf("Deleted s3://%s/%s.", bucketName, objectKey),
	}, nil
}

func (s *S3Inventory) CreateBucket(
	ctx context.Context,
	profile models.ProfileSummary,
	bucketName string,
	region string,
) (models.AwsS3CreateBucketResult, error) {
	bucketName = strings.TrimSpace(bucketName)
	if bucketName == "" {
		return models.AwsS3CreateBucketResult{}, fmt.Errorf("bucket name is required")
	}
	if region == "" {
		region = awsRegionHint(profile)
	}
	cfg, err := s.loadConfig(ctx, profile, region)
	if err != nil {
		return models.AwsS3CreateBucketResult{}, err
	}
	input := &s3.CreateBucketInput{
		Bucket: aws.String(bucketName),
	}
	if region != "" && region != "us-east-1" {
		input.CreateBucketConfiguration = &types.CreateBucketConfiguration{
			LocationConstraint: types.BucketLocationConstraint(region),
		}
	}
	client := s3Client(cfg, profile)
	_, err = client.CreateBucket(ctx, input)
	if err != nil {
		return models.AwsS3CreateBucketResult{}, err
	}
	s.mu.Lock()
	s.bucketRegions[bucketName] = region
	s.mu.Unlock()
	return models.AwsS3CreateBucketResult{
		BucketName: bucketName,
		Region:     region,
	}, nil
}

func (s *S3Inventory) PresignGetObject(
	ctx context.Context,
	profile models.ProfileSummary,
	bucketName string,
	objectKey string,
	durationSeconds int,
) (models.AwsS3PresignResult, error) {
	if bucketName == "" || objectKey == "" {
		return models.AwsS3PresignResult{}, fmt.Errorf("select an S3 bucket and object before generating a signed URL")
	}
	if durationSeconds <= 0 {
		durationSeconds = 3600
	}

	region, err := s.bucketRegion(ctx, profile, bucketName)
	if err != nil {
		return models.AwsS3PresignResult{}, err
	}

	cfg, err := s.loadConfig(ctx, profile, region)
	if err != nil {
		return models.AwsS3PresignResult{}, err
	}

	client := s3Client(cfg, profile)
	presigner := s3.NewPresignClient(client)
	request, err := presigner.PresignGetObject(ctx, &s3.GetObjectInput{
		Bucket: aws.String(bucketName),
		Key:    aws.String(objectKey),
	}, func(options *s3.PresignOptions) {
		options.Expires = time.Duration(durationSeconds) * time.Second
	})
	if err != nil {
		return models.AwsS3PresignResult{}, err
	}

	return models.AwsS3PresignResult{
		BucketName:       bucketName,
		ObjectKey:        objectKey,
		URL:              request.URL,
		DurationSeconds:  durationSeconds,
		ExpiresAt:        time.Now().UTC().Add(time.Duration(durationSeconds) * time.Second).Format(time.RFC3339),
		EffectiveWarning: "If the profile uses temporary credentials, the URL can stop working before this nominal expiry.",
	}, nil
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

	if endpointURL := awsEndpointURL(profile); endpointURL != "" {
		return awsRegionHint(profile), nil
	}

	cfg, err := s.loadConfig(ctx, profile, awsRegionHint(profile))
	if err != nil {
		return "", err
	}

	region, err := s3manager.GetBucketRegion(ctx, s3Client(cfg, profile), bucketName)
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
	return loadAWSConfig(ctx, s.settings, profile, region)
}

func s3Client(cfg aws.Config, profile models.ProfileSummary) *s3.Client {
	return s3.NewFromConfig(cfg, func(options *s3.Options) {
		if endpointURL := awsEndpointURL(profile); endpointURL != "" {
			options.BaseEndpoint = aws.String(endpointURL)
			options.UsePathStyle = true
		}
	})
}

func awsRegionHint(profile models.ProfileSummary) string {
	for _, field := range profile.Attributes {
		if field.Label == "Region" && field.Value != "" {
			return field.Value
		}
	}
	return "us-east-1"
}

func awsEndpointURL(profile models.ProfileSummary) string {
	for _, field := range profile.Attributes {
		if normaliseAWSProfileField(field.Label) == "endpointurl" {
			return strings.TrimSpace(field.Value)
		}
	}
	return ""
}

func normaliseAWSProfileField(label string) string {
	replacer := strings.NewReplacer(" ", "", "_", "", "-", "")
	return strings.ToLower(replacer.Replace(label))
}

func boolValue(value *bool) bool {
	if value == nil {
		return false
	}
	return *value
}

func awsString(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}

package awsadapter

import (
	"context"
	"encoding/base64"
	"fmt"
	"sort"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	awscfg "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/cloudwatchlogs"
	cwtypes "github.com/aws/aws-sdk-go-v2/service/cloudwatchlogs/types"
	"github.com/aws/aws-sdk-go-v2/service/lambda"
	"github.com/aws/aws-sdk-go-v2/service/lambda/types"

	"cloudsprocket/backend/daemon/internal/config"
	"cloudsprocket/backend/daemon/internal/models"
)

// LambdaInventory provides read-mostly inventory for AWS Lambda plus one safe
// write action (Invoke) for testing. Endpoint override is honoured so the
// behaviour is identical against real AWS and LocalStack.
type LambdaInventory struct {
	settings config.Settings
}

func NewLambdaInventory(settings config.Settings) *LambdaInventory {
	return &LambdaInventory{settings: settings}
}

func (l *LambdaInventory) ListFunctions(
	ctx context.Context,
	profile models.ProfileSummary,
	region string,
) ([]models.AwsLambdaFunction, error) {
	if region == "" {
		region = awsRegionHint(profile)
	}
	cfg, err := l.loadConfig(ctx, profile, region)
	if err != nil {
		return nil, err
	}

	client := lambdaClient(cfg, profile)
	paginator := lambda.NewListFunctionsPaginator(client, &lambda.ListFunctionsInput{})
	functions := []models.AwsLambdaFunction{}
	for paginator.HasMorePages() {
		page, err := paginator.NextPage(ctx)
		if err != nil {
			return nil, err
		}
		for _, fn := range page.Functions {
			functions = append(functions, lambdaFunctionSummary(fn))
		}
	}
	sort.SliceStable(functions, func(i, j int) bool {
		return functions[i].FunctionName < functions[j].FunctionName
	})
	return functions, nil
}

func (l *LambdaInventory) DescribeFunction(
	ctx context.Context,
	profile models.ProfileSummary,
	region string,
	functionName string,
) (models.AwsLambdaFunction, error) {
	if functionName == "" {
		return models.AwsLambdaFunction{}, fmt.Errorf("function name is required")
	}
	if region == "" {
		region = awsRegionHint(profile)
	}
	cfg, err := l.loadConfig(ctx, profile, region)
	if err != nil {
		return models.AwsLambdaFunction{}, err
	}

	client := lambdaClient(cfg, profile)
	res, err := client.GetFunction(ctx, &lambda.GetFunctionInput{
		FunctionName: aws.String(functionName),
	})
	if err != nil {
		return models.AwsLambdaFunction{}, err
	}

	fn := lambdaFunctionSummary(res.Configuration)
	if res.Configuration != nil {
		if res.Configuration.State != nil {
			fn.State = string(res.Configuration.State.State)
		}
		if res.Configuration.CodeSize != nil {
			fn.CodeSize = *res.Configuration.CodeSize
		}
		fn.Handler = awsString(res.Configuration.Handler)
		if res.Configuration.Timeout != nil {
			fn.Timeout = *res.Configuration.Timeout
		}
	}
	// Log group is conventionally /aws/lambda/<name>
	fn.LogGroup = "/aws/lambda/" + functionName

	// Best-effort recent logs (adds value for the Lambda describe without
	// requiring the separate CloudWatch Logs service panel yet).
	recent, _ := l.recentLogs(ctx, cfg, profile, fn.LogGroup, 20)
	fn.RecentLogs = recent

	return fn, nil
}

func (l *LambdaInventory) InvokeFunction(
	ctx context.Context,
	profile models.ProfileSummary,
	region string,
	functionName string,
	payload []byte,
) (models.AwsLambdaInvokeResult, error) {
	if functionName == "" {
		return models.AwsLambdaInvokeResult{}, fmt.Errorf("function name is required")
	}
	if region == "" {
		region = awsRegionHint(profile)
	}
	cfg, err := l.loadConfig(ctx, profile, region)
	if err != nil {
		return models.AwsLambdaInvokeResult{}, err
	}

	client := lambdaClient(cfg, profile)
	res, err := client.Invoke(ctx, &lambda.InvokeInput{
		FunctionName: aws.String(functionName),
		Payload:      payload,
	})
	if err != nil {
		return models.AwsLambdaInvokeResult{}, err
	}

	result := models.AwsLambdaInvokeResult{
		StatusCode:      res.StatusCode,
		ExecutedVersion: awsString(res.ExecutedVersion),
		FunctionError:   awsString(res.FunctionError),
	}
	if len(res.LogResult) > 0 {
		if decoded, derr := base64.StdEncoding.DecodeString(awsString(&res.LogResult)); derr == nil {
			result.LogResult = string(decoded)
		} else {
			result.LogResult = awsString(&res.LogResult)
		}
	}
	if len(res.Payload) > 0 {
		result.Payload = string(res.Payload)
	}
	return result, nil
}

func (l *LambdaInventory) loadConfig(
	ctx context.Context,
	profile models.ProfileSummary,
	region string,
) (aws.Config, error) {
	return awscfg.LoadDefaultConfig(
		ctx,
		awscfg.WithSharedConfigProfile(profile.ProfileID),
		awscfg.WithSharedConfigFiles([]string{l.settings.AWSConfigPath}),
		awscfg.WithSharedCredentialsFiles([]string{l.settings.AWSCredentialsPath}),
		awscfg.WithRegion(region),
	)
}

func lambdaClient(cfg aws.Config, profile models.ProfileSummary) *lambda.Client {
	return lambda.NewFromConfig(cfg, func(options *lambda.Options) {
		if endpointURL := awsEndpointURL(profile); endpointURL != "" {
			options.BaseEndpoint = aws.String(endpointURL)
		}
	})
}

func cwlogsClient(cfg aws.Config, profile models.ProfileSummary) *cloudwatchlogs.Client {
	return cloudwatchlogs.NewFromConfig(cfg, func(options *cloudwatchlogs.Options) {
		if endpointURL := awsEndpointURL(profile); endpointURL != "" {
			options.BaseEndpoint = aws.String(endpointURL)
		}
	})
}

func lambdaFunctionSummary(cfg *types.FunctionConfiguration) models.AwsLambdaFunction {
	if cfg == nil {
		return models.AwsLambdaFunction{}
	}
	fn := models.AwsLambdaFunction{
		FunctionName: awsString(cfg.FunctionName),
		Runtime:      string(cfg.Runtime),
		Description:  awsString(cfg.Description),
	}
	if cfg.MemorySize != nil {
		fn.MemorySize = *cfg.MemorySize
	}
	if cfg.LastModified != nil {
		// Lambda returns RFC3339-ish or unix; normalise
		if t, perr := time.Parse(time.RFC3339, *cfg.LastModified); perr == nil {
			fn.LastModified = t.UTC().Format(time.RFC3339)
		} else {
			fn.LastModified = *cfg.LastModified
		}
	}
	return fn
}

func (l *LambdaInventory) recentLogs(
	ctx context.Context,
	cfg aws.Config,
	profile models.ProfileSummary,
	logGroup string,
	limit int,
) ([]string, error) {
	if logGroup == "" || limit <= 0 {
		return nil, nil
	}
	client := cwlogsClient(cfg, profile)
	// Start from now backwards; take most recent N
	start := time.Now().Add(-24 * time.Hour).UnixMilli() // last day is plenty for "recent"
	input := &cloudwatchlogs.FilterLogEventsInput{
		LogGroupName: aws.String(logGroup),
		StartTime:    aws.Int64(start),
		Limit:        aws.Int32(int32(limit)),
	}
	// Sort by timestamp desc after fetch (API is ascending)
	paginator := cloudwatchlogs.NewFilterLogEventsPaginator(client, input)
	events := []cwtypes.FilteredLogEvent{}
	for paginator.HasMorePages() && len(events) < limit {
		page, err := paginator.NextPage(ctx)
		if err != nil {
			return nil, err
		}
		events = append(events, page.Events...)
	}
	// Newest first
	sort.SliceStable(events, func(i, j int) bool {
		ti := int64(0)
		if events[i].Timestamp != nil {
			ti = *events[i].Timestamp
		}
		tj := int64(0)
		if events[j].Timestamp != nil {
			tj = *events[j].Timestamp
		}
		return ti > tj
	})
	if len(events) > limit {
		events = events[:limit]
	}
	out := make([]string, 0, len(events))
	for _, e := range events {
		ts := ""
		if e.Timestamp != nil {
			ts = time.UnixMilli(*e.Timestamp).UTC().Format("2006-01-02 15:04:05")
		}
		msg := awsString(e.Message)
		if ts != "" {
			out = append(out, ts+" "+msg)
		} else {
			out = append(out, msg)
		}
	}
	return out, nil
}
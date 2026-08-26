module cloudsprocket/backend/daemon

go 1.26.6

require (
	github.com/Azure/azure-sdk-for-go/sdk/azcore v1.22.0
	github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/compute/armcompute/v8 v8.2.0
	github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/resources/armresources/v4 v4.0.0
	github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/storage/armstorage/v4 v4.1.0
	github.com/Azure/azure-sdk-for-go/sdk/storage/azblob v1.8.0
	github.com/Azure/azure-sdk-for-go/sdk/storage/azqueue/v2 v2.1.0
	github.com/aws/aws-sdk-go-v2 v1.43.5
	github.com/aws/aws-sdk-go-v2/config v1.32.36
	github.com/aws/aws-sdk-go-v2/feature/dynamodb/attributevalue v1.20.60
	github.com/aws/aws-sdk-go-v2/feature/s3/manager v1.22.42
	github.com/aws/aws-sdk-go-v2/service/apigateway v1.42.5
	github.com/aws/aws-sdk-go-v2/service/apigatewayv2 v1.37.5
	github.com/aws/aws-sdk-go-v2/service/cloudformation v1.76.2
	github.com/aws/aws-sdk-go-v2/service/cloudwatchlogs v1.82.1
	github.com/aws/aws-sdk-go-v2/service/dynamodb v1.63.2
	github.com/aws/aws-sdk-go-v2/service/ec2 v1.321.1
	github.com/aws/aws-sdk-go-v2/service/ecs v1.90.1
	github.com/aws/aws-sdk-go-v2/service/eks v1.90.5
	github.com/aws/aws-sdk-go-v2/service/elasticloadbalancingv2 v1.58.6
	github.com/aws/aws-sdk-go-v2/service/eventbridge v1.48.5
	github.com/aws/aws-sdk-go-v2/service/iam v1.58.2
	github.com/aws/aws-sdk-go-v2/service/kms v1.55.5
	github.com/aws/aws-sdk-go-v2/service/lambda v1.101.3
	github.com/aws/aws-sdk-go-v2/service/rds v1.124.2
	github.com/aws/aws-sdk-go-v2/service/route53 v1.65.7
	github.com/aws/aws-sdk-go-v2/service/s3 v1.107.1
	github.com/aws/aws-sdk-go-v2/service/secretsmanager v1.44.5
	github.com/aws/aws-sdk-go-v2/service/sns v1.42.5
	github.com/aws/aws-sdk-go-v2/service/sqs v1.46.5
	github.com/dustin/go-humanize v1.0.1
	github.com/hashicorp/terraform-config-inspect v0.0.0-20260709150029-2fb54c236733
	github.com/moby/moby/api v1.55.0
	github.com/moby/moby/client v0.5.1
	golang.org/x/mod v0.40.0
	golang.org/x/sys v0.47.0
	gopkg.in/yaml.v3 v3.0.1
	modernc.org/sqlite v1.56.0
)

require (
	github.com/Azure/azure-sdk-for-go/sdk/internal v1.12.0 // indirect
	github.com/Microsoft/go-winio v0.6.2 // indirect
	github.com/agext/levenshtein v1.2.2 // indirect
	github.com/apparentlymart/go-textseg/v15 v15.0.0 // indirect
	github.com/aws/aws-sdk-go-v2/aws/protocol/eventstream v1.7.17 // indirect
	github.com/aws/aws-sdk-go-v2/credentials v1.19.35 // indirect
	github.com/aws/aws-sdk-go-v2/feature/ec2/imds v1.18.36 // indirect
	github.com/aws/aws-sdk-go-v2/internal/configsources v1.4.36 // indirect
	github.com/aws/aws-sdk-go-v2/internal/endpoints/v2 v2.7.36 // indirect
	github.com/aws/aws-sdk-go-v2/internal/v4a v1.4.37 // indirect
	github.com/aws/aws-sdk-go-v2/service/dynamodbstreams v1.36.5 // indirect
	github.com/aws/aws-sdk-go-v2/service/internal/accept-encoding v1.13.16 // indirect
	github.com/aws/aws-sdk-go-v2/service/internal/checksum v1.9.29 // indirect
	github.com/aws/aws-sdk-go-v2/service/internal/endpoint-discovery v1.12.13 // indirect
	github.com/aws/aws-sdk-go-v2/service/internal/presigned-url v1.13.36 // indirect
	github.com/aws/aws-sdk-go-v2/service/internal/s3shared v1.19.37 // indirect
	github.com/aws/aws-sdk-go-v2/service/signin v1.5.5 // indirect
	github.com/aws/aws-sdk-go-v2/service/sso v1.33.5 // indirect
	github.com/aws/aws-sdk-go-v2/service/ssooidc v1.38.5 // indirect
	github.com/aws/aws-sdk-go-v2/service/sts v1.45.5 // indirect
	github.com/aws/smithy-go v1.27.7 // indirect
	github.com/containerd/errdefs v1.0.0 // indirect
	github.com/containerd/errdefs/pkg v0.3.0 // indirect
	github.com/distribution/reference v0.6.0 // indirect
	github.com/docker/go-connections v0.7.0 // indirect
	github.com/docker/go-units v0.5.0 // indirect
	github.com/felixge/httpsnoop v1.0.4 // indirect
	github.com/go-logr/logr v1.4.2 // indirect
	github.com/go-logr/stdr v1.2.2 // indirect
	github.com/google/go-cmp v0.7.0 // indirect
	github.com/google/uuid v1.6.0 // indirect
	github.com/hashicorp/hcl v0.0.0-20170504190234-a4b07c25de5f // indirect
	github.com/hashicorp/hcl/v2 v2.20.1 // indirect
	github.com/mattn/go-isatty v0.0.24 // indirect
	github.com/mitchellh/go-wordwrap v1.0.0 // indirect
	github.com/moby/docker-image-spec v1.3.1 // indirect
	github.com/ncruces/go-strftime v1.0.0 // indirect
	github.com/opencontainers/go-digest v1.0.0 // indirect
	github.com/opencontainers/image-spec v1.1.1 // indirect
	github.com/remyoudompheng/bigfft v0.0.0-20230129092748-24d4a6f8daec // indirect
	github.com/zclconf/go-cty v1.14.4 // indirect
	go.opentelemetry.io/auto/sdk v1.1.0 // indirect
	go.opentelemetry.io/contrib/instrumentation/net/http/otelhttp v0.60.0 // indirect
	go.opentelemetry.io/otel v1.35.0 // indirect
	go.opentelemetry.io/otel/metric v1.35.0 // indirect
	go.opentelemetry.io/otel/trace v1.35.0 // indirect
	golang.org/x/net v0.58.0 // indirect
	golang.org/x/sync v0.22.0 // indirect
	golang.org/x/text v0.41.0 // indirect
	golang.org/x/tools v0.49.0 // indirect
	modernc.org/libc v1.74.4 // indirect
	modernc.org/mathutil v1.7.1 // indirect
	modernc.org/memory v1.11.0 // indirect
)

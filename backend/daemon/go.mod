module cloudsprocket/backend/daemon

go 1.26.1

require (
	github.com/Azure/azure-sdk-for-go/sdk/azcore v1.22.0
	github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/compute/armcompute/v6 v6.4.0
	github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/compute/armcompute/v8 v8.1.0
	github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/resources/armresources/v3 v3.0.1
	github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/resources/armresources/v4 v4.0.0
	github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/storage/armstorage v1.8.1
	github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/storage/armstorage/v4 v4.1.0
	github.com/Azure/azure-sdk-for-go/sdk/storage/azblob v1.8.0
	github.com/Azure/azure-sdk-for-go/sdk/storage/azqueue v1.0.1
	github.com/Azure/azure-sdk-for-go/sdk/storage/azqueue/v2 v2.1.0
	github.com/aws/aws-sdk-go-v2 v1.42.1
	github.com/aws/aws-sdk-go-v2/config v1.32.27
	github.com/aws/aws-sdk-go-v2/feature/dynamodb/attributevalue v1.20.50
	github.com/aws/aws-sdk-go-v2/feature/s3/manager v1.22.30
	github.com/aws/aws-sdk-go-v2/service/apigateway v1.40.8
	github.com/aws/aws-sdk-go-v2/service/apigatewayv2 v1.35.8
	github.com/aws/aws-sdk-go-v2/service/cloudformation v1.73.1
	github.com/aws/aws-sdk-go-v2/service/cloudwatchlogs v1.78.2
	github.com/aws/aws-sdk-go-v2/service/dynamodb v1.59.2
	github.com/aws/aws-sdk-go-v2/service/ec2 v1.311.0
	github.com/aws/aws-sdk-go-v2/service/ecs v1.86.2
	github.com/aws/aws-sdk-go-v2/service/eks v1.88.1
	github.com/aws/aws-sdk-go-v2/service/elasticloadbalancingv2 v1.55.6
	github.com/aws/aws-sdk-go-v2/service/eventbridge v1.46.8
	github.com/aws/aws-sdk-go-v2/service/iam v1.54.7
	github.com/aws/aws-sdk-go-v2/service/kms v1.53.6
	github.com/aws/aws-sdk-go-v2/service/lambda v1.94.1
	github.com/aws/aws-sdk-go-v2/service/rds v1.119.5
	github.com/aws/aws-sdk-go-v2/service/route53 v1.62.1
	github.com/aws/aws-sdk-go-v2/service/s3 v1.104.2
	github.com/aws/aws-sdk-go-v2/service/secretsmanager v1.42.5
	github.com/aws/aws-sdk-go-v2/service/sns v1.40.3
	github.com/aws/aws-sdk-go-v2/service/sqs v1.44.2
	github.com/dustin/go-humanize v1.0.1
	github.com/hashicorp/terraform-config-inspect v0.0.0-20260224005459-813a97530220
	github.com/moby/moby/api v1.55.0
	github.com/moby/moby/client v0.5.0
	golang.org/x/sys v0.46.0
	gopkg.in/yaml.v3 v3.0.1
	modernc.org/sqlite v1.53.0
)

require (
	github.com/Azure/azure-sdk-for-go/sdk/azidentity v1.14.0 // indirect
	github.com/Azure/azure-sdk-for-go/sdk/internal v1.12.0 // indirect
	github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/internal/v3 v3.2.0 // indirect
	github.com/Microsoft/go-winio v0.6.2 // indirect
	github.com/agext/levenshtein v1.2.2 // indirect
	github.com/apparentlymart/go-textseg/v15 v15.0.0 // indirect
	github.com/aws/aws-sdk-go-v2/aws/protocol/eventstream v1.7.14 // indirect
	github.com/aws/aws-sdk-go-v2/credentials v1.19.26 // indirect
	github.com/aws/aws-sdk-go-v2/feature/ec2/imds v1.18.30 // indirect
	github.com/aws/aws-sdk-go-v2/internal/configsources v1.4.30 // indirect
	github.com/aws/aws-sdk-go-v2/internal/endpoints/v2 v2.7.30 // indirect
	github.com/aws/aws-sdk-go-v2/internal/v4a v1.4.31 // indirect
	github.com/aws/aws-sdk-go-v2/service/dynamodbstreams v1.34.2 // indirect
	github.com/aws/aws-sdk-go-v2/service/internal/accept-encoding v1.13.13 // indirect
	github.com/aws/aws-sdk-go-v2/service/internal/checksum v1.9.23 // indirect
	github.com/aws/aws-sdk-go-v2/service/internal/endpoint-discovery v1.12.7 // indirect
	github.com/aws/aws-sdk-go-v2/service/internal/presigned-url v1.13.30 // indirect
	github.com/aws/aws-sdk-go-v2/service/internal/s3shared v1.19.31 // indirect
	github.com/aws/aws-sdk-go-v2/service/signin v1.2.2 // indirect
	github.com/aws/aws-sdk-go-v2/service/sso v1.31.5 // indirect
	github.com/aws/aws-sdk-go-v2/service/ssooidc v1.36.8 // indirect
	github.com/aws/aws-sdk-go-v2/service/sts v1.43.5 // indirect
	github.com/aws/smithy-go v1.27.3 // indirect
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
	github.com/mattn/go-isatty v0.0.20 // indirect
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
	golang.org/x/mod v0.36.0 // indirect
	golang.org/x/net v0.56.0 // indirect
	golang.org/x/sync v0.21.0 // indirect
	golang.org/x/text v0.38.0 // indirect
	golang.org/x/tools v0.45.0 // indirect
	modernc.org/libc v1.73.4 // indirect
	modernc.org/mathutil v1.7.1 // indirect
	modernc.org/memory v1.11.0 // indirect
)

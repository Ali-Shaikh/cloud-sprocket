// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import awsApigatewayIconUrl from "@/assets/cloud-icons/aws-apigateway.svg";
import awsCloudwatchIconUrl from "@/assets/cloud-icons/aws-cloudwatch.svg";
import awsDynamodbIconUrl from "@/assets/cloud-icons/aws-dynamodb.svg";
import awsEc2IconUrl from "@/assets/cloud-icons/aws-ec2.svg";
import awsEcsIconUrl from "@/assets/cloud-icons/aws-ecs.svg";
import awsEksIconUrl from "@/assets/cloud-icons/aws-eks.svg";
import awsIamIconUrl from "@/assets/cloud-icons/aws-iam.svg";
import awsLambdaIconUrl from "@/assets/cloud-icons/aws-lambda.svg";
import awsRdsIconUrl from "@/assets/cloud-icons/aws-rds.svg";
import awsS3IconUrl from "@/assets/cloud-icons/aws-s3.svg";
import awsSecretsManagerIconUrl from "@/assets/cloud-icons/aws-secrets-manager.svg";
import awsSnsIconUrl from "@/assets/cloud-icons/aws-sns.svg";
import awsSqsIconUrl from "@/assets/cloud-icons/aws-sqs.svg";
import azureAppServiceIconUrl from "@/assets/cloud-icons/azure-app-service.svg";
import azureCosmosIconUrl from "@/assets/cloud-icons/azure-cosmos.svg";
import azureEntraIconUrl from "@/assets/cloud-icons/azure-entra.svg";
import azureFunctionsIconUrl from "@/assets/cloud-icons/azure-functions.svg";
import azureKeyVaultIconUrl from "@/assets/cloud-icons/azure-key-vault.svg";
import azureLogAnalyticsIconUrl from "@/assets/cloud-icons/azure-log-analytics.svg";
import azureQueuesIconUrl from "@/assets/cloud-icons/azure-queues.svg";
import azureResourceGroupsIconUrl from "@/assets/cloud-icons/azure-resource-groups.svg";
import azureStorageIconUrl from "@/assets/cloud-icons/azure-storage.svg";
import azureVmIconUrl from "@/assets/cloud-icons/azure-vm.svg";
import azureWafIconUrl from "@/assets/cloud-icons/azure-waf.svg";
import azureIconUrl from "@/assets/cloud-icons/azure.svg";
import gcpIconUrl from "@/assets/cloud-icons/gcp.svg";

const SERVICE_ICON_URLS: Record<string, string> = {
  logs: awsCloudwatchIconUrl,
  s3: awsS3IconUrl,
  ec2: awsEc2IconUrl,
  lambda: awsLambdaIconUrl,
  dynamodb: awsDynamodbIconUrl,
  sqs: awsSqsIconUrl,
  sns: awsSnsIconUrl,
  rds: awsRdsIconUrl,
  ecs: awsEcsIconUrl,
  eks: awsEksIconUrl,
  apigateway: awsApigatewayIconUrl,
  secrets: awsSecretsManagerIconUrl,
  iam: awsIamIconUrl,
  "azure-overview": azureIconUrl,
  "azure-resource-groups": azureResourceGroupsIconUrl,
  "azure-vms": azureVmIconUrl,
  "azure-storage": azureStorageIconUrl,
  "azure-app-service": azureAppServiceIconUrl,
  "azure-functions": azureFunctionsIconUrl,
  "azure-key-vault": azureKeyVaultIconUrl,
  "azure-cosmos": azureCosmosIconUrl,
  "azure-postgres": awsRdsIconUrl,
  "azure-queues": azureQueuesIconUrl,
  "azure-entra": azureEntraIconUrl,
  "azure-log-analytics": azureLogAnalyticsIconUrl,
  "azure-waf": azureWafIconUrl,
  "azure-front-door": azureWafIconUrl,
  "gcp-overview": gcpIconUrl,
  "gcp-storage": gcpIconUrl,
  "gcp-compute": gcpIconUrl,
  "gcp-functions": gcpIconUrl,
  "gcp-gke": gcpIconUrl,
};

export function serviceCatalogIconUrl(serviceId: string): string | undefined {
  return SERVICE_ICON_URLS[serviceId];
}
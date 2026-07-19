// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import type { WorkspaceSnapshot } from "@/types/backend";

export type CliSnippet = {
  label: string;
  command: string;
};

/**
 * Build a "Copy as CLI" snippet for the currently selected inventory resource.
 * Returns null when nothing useful is selected. Pure frontend; no RPC.
 */
export function selectedResourceCli(
  workspace: WorkspaceSnapshot | null | undefined,
  provider: "aws" | "azure" | undefined,
  activeTabId: string,
): CliSnippet | null {
  if (!workspace || !provider) return null;

  if (provider === "aws") {
    const region =
      workspace.selectedEc2Region ||
      workspace.selectedLambdaRegion ||
      workspace.selectedSqsRegion ||
      workspace.selectedDynamodbRegion ||
      workspace.selectedRdsRegion ||
      workspace.selectedLogsRegion ||
      "us-east-1";
    const regionFlag = `--region ${region}`;

    switch (activeTabId) {
      case "s3": {
        const bucket = workspace.selectedS3BucketName?.trim();
        if (!bucket) return null;
        return {
          label: `aws s3 ls s3://${bucket}`,
          command: `aws s3 ls s3://${bucket}/ ${regionFlag}`,
        };
      }
      case "ec2": {
        const id = workspace.selectedEc2InstanceId?.trim();
        if (!id) return null;
        return {
          label: "aws ec2 describe-instances",
          command: `aws ec2 describe-instances --instance-ids ${id} ${regionFlag}`,
        };
      }
      case "lambda": {
        const name = workspace.selectedLambdaFunctionName?.trim();
        if (!name) return null;
        return {
          label: "aws lambda get-function",
          command: `aws lambda get-function --function-name ${name} ${regionFlag}`,
        };
      }
      case "dynamodb": {
        const table = workspace.selectedDynamodbTableName?.trim();
        if (!table) return null;
        return {
          label: "aws dynamodb describe-table",
          command: `aws dynamodb describe-table --table-name ${table} ${regionFlag}`,
        };
      }
      case "sqs": {
        const url = workspace.selectedSqsQueueUrl?.trim();
        if (!url) return null;
        return {
          label: "aws sqs get-queue-attributes",
          command: `aws sqs get-queue-attributes --queue-url "${url}" --attribute-names All ${regionFlag}`,
        };
      }
      case "sns": {
        const arn = workspace.selectedSnsTopicArn?.trim();
        if (!arn) return null;
        return {
          label: "aws sns get-topic-attributes",
          command: `aws sns get-topic-attributes --topic-arn ${arn} ${regionFlag}`,
        };
      }
      case "rds": {
        const id = workspace.selectedRdsInstanceId?.trim();
        if (!id) return null;
        return {
          label: "aws rds describe-db-instances",
          command: `aws rds describe-db-instances --db-instance-identifier ${id} ${regionFlag}`,
        };
      }
      case "logs": {
        const group = workspace.selectedLogGroupName?.trim();
        if (!group) return null;
        return {
          label: "aws logs tail",
          command: `aws logs tail "${group}" --follow ${regionFlag}`,
        };
      }
      case "iam": {
        const role = workspace.selectedIamRoleName?.trim();
        if (!role) return null;
        return {
          label: "aws iam get-role",
          command: `aws iam get-role --role-name ${role}`,
        };
      }
      case "secrets": {
        const secret = workspace.selectedSecretsManagerName?.trim();
        if (!secret) return null;
        return {
          label: "aws secretsmanager describe-secret",
          command: `aws secretsmanager describe-secret --secret-id ${secret} ${regionFlag}`,
        };
      }
      default:
        return null;
    }
  }

  // Azure
  const resourceGroup = workspace.selectedAzureResourceGroup?.trim();
  switch (activeTabId) {
    case "azure-resource-groups": {
      if (!resourceGroup) return null;
      return {
        label: "az group show",
        command: `az group show --name ${resourceGroup}`,
      };
    }
    case "azure-vms": {
      const vmId = workspace.selectedAzureVmId?.trim();
      if (!vmId) return null;
      return {
        label: "az vm show",
        command: `az vm show --ids "${vmId}"`,
      };
    }
    case "azure-storage": {
      const account = workspace.selectedAzureStorageAccount?.trim();
      if (!account) return null;
      return {
        label: "az storage account show",
        command: resourceGroup
          ? `az storage account show --name ${account} --resource-group ${resourceGroup}`
          : `az storage account show --name ${account}`,
      };
    }
    case "azure-app-service": {
      const app = workspace.selectedAzureWebAppName?.trim();
      if (!app || !resourceGroup) return null;
      return {
        label: "az webapp show",
        command: `az webapp show --name ${app} --resource-group ${resourceGroup}`,
      };
    }
    case "azure-postgres": {
      const server = workspace.selectedAzurePostgresServer?.trim();
      if (!server || !resourceGroup) return null;
      return {
        label: "az postgres flexible-server show",
        command: `az postgres flexible-server show --name ${server} --resource-group ${resourceGroup}`,
      };
    }
    case "azure-key-vault": {
      const vault = workspace.selectedAzureKeyVault?.trim();
      if (!vault) return null;
      return {
        label: "az keyvault show",
        command: `az keyvault show --name ${vault}`,
      };
    }
    case "azure-functions": {
      const app = workspace.selectedAzureFunctionApp?.trim();
      if (!app || !resourceGroup) return null;
      return {
        label: "az functionapp show",
        command: `az functionapp show --name ${app} --resource-group ${resourceGroup}`,
      };
    }
    default:
      return null;
  }
}

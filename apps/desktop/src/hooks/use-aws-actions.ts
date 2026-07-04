// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { startTransition, useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from "react";

import { backendRequest } from "@/lib/backend";
import { requestWorkspaceSnapshot } from "@/lib/workspace-request";
import type {
  AwsLambdaCreateInput,
  AwsLambdaInvokeResult,
  AwsSqsPeekResult,
  JobStatus,
  WorkspaceSnapshot,
} from "@/types/backend";

export type EC2LifecycleAction = "start" | "stop" | "reboot";

export type UseAwsActionsParams = {
  workspace: WorkspaceSnapshot;
  setWorkspace: Dispatch<SetStateAction<WorkspaceSnapshot>>;
  s3PrefixRequestIdRef: MutableRefObject<number>;
  lambdaInvokeInFlight: boolean;
  lambdaCreateInFlight: boolean;
  setEC2ActionStatus: Dispatch<SetStateAction<string>>;
  setEC2ActionInFlight: Dispatch<SetStateAction<boolean>>;
  setLambdaActionStatus: Dispatch<SetStateAction<string>>;
  setLambdaInvokeResult: Dispatch<SetStateAction<AwsLambdaInvokeResult | null>>;
  setLambdaInvokeInFlight: Dispatch<SetStateAction<boolean>>;
  setLambdaCreateInFlight: Dispatch<SetStateAction<boolean>>;
  setDynamodbActionStatus: Dispatch<SetStateAction<string>>;
  setSqsActionStatus: Dispatch<SetStateAction<string>>;
  setSqsPeekResult: Dispatch<SetStateAction<AwsSqsPeekResult | null>>;
  setSqsPeekInFlight: Dispatch<SetStateAction<boolean>>;
  setSnsActionStatus: Dispatch<SetStateAction<string>>;
  setRdsActionStatus: Dispatch<SetStateAction<string>>;
  setEcsActionStatus: Dispatch<SetStateAction<string>>;
  setApiGatewayActionStatus: Dispatch<SetStateAction<string>>;
  setLogsActionStatus: Dispatch<SetStateAction<string>>;
  setIamActionStatus: Dispatch<SetStateAction<string>>;
};

export function useAwsActions(params: UseAwsActionsParams) {
  const {
    workspace,
    setWorkspace,
    s3PrefixRequestIdRef,
    lambdaInvokeInFlight,
    lambdaCreateInFlight,
    setEC2ActionStatus,
    setEC2ActionInFlight,
    setLambdaActionStatus,
    setLambdaInvokeResult,
    setLambdaInvokeInFlight,
    setLambdaCreateInFlight,
    setDynamodbActionStatus,
    setSqsActionStatus,
    setSqsPeekResult,
    setSqsPeekInFlight,
    setSnsActionStatus,
    setRdsActionStatus,
    setEcsActionStatus,
    setApiGatewayActionStatus,
    setLogsActionStatus,
    setIamActionStatus,
  } = params;

  const refreshEC2Inventory = useCallback((): void => {
    const region = workspace.selectedEc2Region;
    if (!region) {
      setEC2ActionStatus("Select an EC2 region before refreshing inventory.");
      return;
    }
    setEC2ActionStatus(`Refreshing EC2 inventory for ${region}.`);
    void requestWorkspaceSnapshot("aws.ec2.selectRegion", { region })
      .then((workspaceResult) => {
        startTransition(() => {
          setWorkspace(workspaceResult);
        });
        setEC2ActionStatus(workspaceResult.ec2StatusMessage || `Loaded EC2 instances from ${region}.`);
      })
      .catch((error: unknown) => {
        setEC2ActionStatus(error instanceof Error ? error.message : String(error));
      });
  }, [setEC2ActionStatus, setWorkspace, workspace.selectedEc2Region]);

  const selectEC2Region = useCallback((region: string): void => {
    setEC2ActionStatus("Select an instance to run lifecycle actions.");
    setEC2ActionInFlight(false);
    void requestWorkspaceSnapshot("aws.ec2.selectRegion", { region }).then((workspaceResult) => {
      startTransition(() => {
        setWorkspace(workspaceResult);
      });
    });
  }, [setEC2ActionInFlight, setEC2ActionStatus, setWorkspace]);

  const selectEC2Instance = useCallback((instanceId: string): void => {
    setEC2ActionStatus("Instance selected. EC2 lifecycle writes require a local endpoint profile with write opt-in.");
    setEC2ActionInFlight(false);
    void requestWorkspaceSnapshot("aws.ec2.selectInstance", { instanceId }).then((workspaceResult) => {
      startTransition(() => {
        setWorkspace(workspaceResult);
      });
    });
  }, [setEC2ActionInFlight, setEC2ActionStatus, setWorkspace]);

  const invokeEC2LifecycleAction = useCallback((action: EC2LifecycleAction, instanceId: string): void => {
    setEC2ActionStatus(`Queueing EC2 ${action} for ${instanceId}.`);
    setEC2ActionInFlight(true);
    void backendRequest<JobStatus>("aws.ec2.invokeAction", { action, instanceId })
      .then((job) => {
        setEC2ActionStatus(job.message);
        setEC2ActionInFlight(job.status === "queued" || job.status === "running");
      })
      .catch((error: unknown) => {
        setEC2ActionStatus(error instanceof Error ? error.message : String(error));
        setEC2ActionInFlight(false);
      });
  }, [setEC2ActionInFlight, setEC2ActionStatus]);

  const refreshLambdaInventory = useCallback((): void => {
    const region = workspace.selectedLambdaRegion;
    if (!region) {
      setLambdaActionStatus("Select a region before refreshing Lambda inventory.");
      return;
    }
    setLambdaActionStatus(`Refreshing Lambda functions for ${region}.`);
    void requestWorkspaceSnapshot("aws.lambda.selectRegion", { region })
      .then((workspaceResult) => {
        startTransition(() => {
          setWorkspace(workspaceResult);
        });
        setLambdaActionStatus(workspaceResult.lambdaStatusMessage || `Loaded Lambda functions from ${region}.`);
        setLambdaInvokeResult(null);
      })
      .catch((error: unknown) => {
        setLambdaActionStatus(error instanceof Error ? error.message : String(error));
      });
  }, [setLambdaActionStatus, setLambdaInvokeResult, setWorkspace, workspace.selectedLambdaRegion]);

  const selectLambdaRegion = useCallback((region: string): void => {
    setLambdaActionStatus(`Loading Lambda functions for ${region}.`);
    setLambdaInvokeInFlight(false);
    setLambdaInvokeResult(null);
    void requestWorkspaceSnapshot("aws.lambda.selectRegion", { region })
      .then((workspaceResult) => {
        startTransition(() => {
          setWorkspace(workspaceResult);
        });
        setLambdaActionStatus(
          workspaceResult.lambdaStatusMessage || `Loaded Lambda functions from ${region}.`,
        );
      })
      .catch((error: unknown) => {
        setLambdaActionStatus(error instanceof Error ? error.message : String(error));
      });
  }, [setLambdaActionStatus, setLambdaInvokeInFlight, setLambdaInvokeResult, setWorkspace]);

  const selectLambdaFunction = useCallback((functionName: string): void => {
    setLambdaInvokeResult(null);
    void requestWorkspaceSnapshot("aws.lambda.selectFunction", { functionName })
      .then((workspaceResult) => {
        startTransition(() => {
          setWorkspace(workspaceResult);
        });
        setLambdaActionStatus(
          workspaceResult.lambdaStatusMessage || `Selected Lambda function ${functionName}.`,
        );
      })
      .catch((error: unknown) => {
        setLambdaActionStatus(error instanceof Error ? error.message : String(error));
      });
  }, [setLambdaActionStatus, setLambdaInvokeResult, setWorkspace]);

  const invokeLambda = useCallback((functionName: string, payload: unknown): void => {
    if (lambdaInvokeInFlight) return;
    setLambdaInvokeInFlight(true);
    const region = workspace.selectedLambdaRegion || "us-east-1";
    setLambdaActionStatus(`Invoking ${functionName} in ${region}...`);
    void backendRequest<AwsLambdaInvokeResult>("aws.lambda.invoke", { functionName, payload: payload || {} })
      .then((result) => {
        setLambdaInvokeResult(result);
        setLambdaActionStatus(`Invoke completed (status ${result?.statusCode ?? "?"})`);
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        setLambdaActionStatus(message);
        setLambdaInvokeResult({ statusCode: 0, error: message });
      })
      .finally(() => setLambdaInvokeInFlight(false));
  }, [
    lambdaInvokeInFlight,
    setLambdaActionStatus,
    setLambdaInvokeInFlight,
    setLambdaInvokeResult,
    workspace.selectedLambdaRegion,
  ]);

  const createLambda = useCallback((input: AwsLambdaCreateInput): void => {
    if (lambdaCreateInFlight) {
      return;
    }
    setLambdaCreateInFlight(true);
    const region = workspace.selectedLambdaRegion || "us-east-1";
    setLambdaActionStatus(`Creating ${input.functionName} in ${region}...`);
    void requestWorkspaceSnapshot("aws.lambda.create", { ...input })
      .then((workspaceResult) => {
        startTransition(() => {
          setWorkspace(workspaceResult);
        });
        setLambdaActionStatus(
          workspaceResult.lambdaStatusMessage ||
            `Created Lambda function ${input.functionName} in ${region}.`,
        );
        setLambdaInvokeResult(null);
      })
      .catch((error: unknown) => {
        setLambdaActionStatus(error instanceof Error ? error.message : String(error));
      })
      .finally(() => setLambdaCreateInFlight(false));
  }, [
    lambdaCreateInFlight,
    setLambdaActionStatus,
    setLambdaCreateInFlight,
    setLambdaInvokeResult,
    setWorkspace,
    workspace.selectedLambdaRegion,
  ]);

  const refreshDynamoDBInventory = useCallback((): void => {
    const region = workspace.selectedDynamodbRegion;
    if (!region) {
      setDynamodbActionStatus("Select a region before refreshing DynamoDB inventory.");
      return;
    }
    setDynamodbActionStatus(`Refreshing DynamoDB tables for ${region}.`);
    void requestWorkspaceSnapshot("aws.dynamodb.selectRegion", { region })
      .then((workspaceResult) => {
        startTransition(() => {
          setWorkspace(workspaceResult);
        });
        setDynamodbActionStatus(
          workspaceResult.dynamodbStatusMessage || `Loaded DynamoDB tables from ${region}.`,
        );
      })
      .catch((error: unknown) => {
        setDynamodbActionStatus(error instanceof Error ? error.message : String(error));
      });
  }, [setDynamodbActionStatus, setWorkspace, workspace.selectedDynamodbRegion]);

  const selectDynamoDBRegion = useCallback((region: string): void => {
    setDynamodbActionStatus(`Loading DynamoDB tables for ${region}.`);
    void requestWorkspaceSnapshot("aws.dynamodb.selectRegion", { region })
      .then((workspaceResult) => {
        startTransition(() => {
          setWorkspace(workspaceResult);
        });
        setDynamodbActionStatus(
          workspaceResult.dynamodbStatusMessage || `Loaded DynamoDB tables from ${region}.`,
        );
      })
      .catch((error: unknown) => {
        setDynamodbActionStatus(error instanceof Error ? error.message : String(error));
      });
  }, [setDynamodbActionStatus, setWorkspace]);

  const selectDynamoDBTable = useCallback((tableName: string): void => {
    void requestWorkspaceSnapshot("aws.dynamodb.selectTable", { tableName })
      .then((workspaceResult) => {
        startTransition(() => {
          setWorkspace(workspaceResult);
        });
        setDynamodbActionStatus(
          workspaceResult.dynamodbStatusMessage || `Selected DynamoDB table ${tableName}.`,
        );
      })
      .catch((error: unknown) => {
        setDynamodbActionStatus(error instanceof Error ? error.message : String(error));
      });
  }, [setDynamodbActionStatus, setWorkspace]);

  const putDynamoDBItem = useCallback((tableName: string, itemJson: string): void => {
    setDynamodbActionStatus(`Putting item into ${tableName}.`);
    void requestWorkspaceSnapshot("aws.dynamodb.putItem", { tableName, itemJson })
      .then((workspaceResult) => {
        startTransition(() => {
          setWorkspace(workspaceResult);
        });
        setDynamodbActionStatus(
          workspaceResult.dynamodbStatusMessage || `Put item into ${tableName}.`,
        );
      })
      .catch((error: unknown) => {
        setDynamodbActionStatus(error instanceof Error ? error.message : String(error));
      });
  }, [setDynamodbActionStatus, setWorkspace]);

  const deleteDynamoDBItem = useCallback((tableName: string, keyJson: string): void => {
    setDynamodbActionStatus(`Deleting item from ${tableName}.`);
    void requestWorkspaceSnapshot("aws.dynamodb.deleteItem", { tableName, keyJson })
      .then((workspaceResult) => {
        startTransition(() => {
          setWorkspace(workspaceResult);
        });
        setDynamodbActionStatus(
          workspaceResult.dynamodbStatusMessage || `Deleted item from ${tableName}.`,
        );
      })
      .catch((error: unknown) => {
        setDynamodbActionStatus(error instanceof Error ? error.message : String(error));
      });
  }, [setDynamodbActionStatus, setWorkspace]);

  const refreshSQSInventory = useCallback((): void => {
    const region = workspace.selectedSqsRegion;
    if (!region) {
      setSqsActionStatus("Select a region before refreshing SQS inventory.");
      return;
    }
    setSqsActionStatus(`Refreshing SQS queues for ${region}.`);
    void requestWorkspaceSnapshot("aws.sqs.selectRegion", { region })
      .then((workspaceResult) => {
        startTransition(() => {
          setWorkspace(workspaceResult);
        });
        setSqsActionStatus(
          workspaceResult.sqsStatusMessage || `Loaded SQS queues from ${region}.`,
        );
      })
      .catch((error: unknown) => {
        setSqsActionStatus(error instanceof Error ? error.message : String(error));
      });
  }, [setSqsActionStatus, setWorkspace, workspace.selectedSqsRegion]);

  const selectSQSRegion = useCallback((region: string): void => {
    setSqsActionStatus(`Loading SQS queues for ${region}.`);
    void requestWorkspaceSnapshot("aws.sqs.selectRegion", { region })
      .then((workspaceResult) => {
        startTransition(() => {
          setWorkspace(workspaceResult);
        });
        setSqsActionStatus(
          workspaceResult.sqsStatusMessage || `Loaded SQS queues from ${region}.`,
        );
      })
      .catch((error: unknown) => {
        setSqsActionStatus(error instanceof Error ? error.message : String(error));
      });
  }, [setSqsActionStatus, setWorkspace]);

  const selectSQSQueue = useCallback((queueUrl: string): void => {
    void requestWorkspaceSnapshot("aws.sqs.selectQueue", { queueUrl })
      .then((workspaceResult) => {
        startTransition(() => {
          setWorkspace(workspaceResult);
        });
        setSqsActionStatus(
          workspaceResult.sqsStatusMessage || "Selected SQS queue.",
        );
      })
      .catch((error: unknown) => {
        setSqsActionStatus(error instanceof Error ? error.message : String(error));
      });
  }, [setSqsActionStatus, setWorkspace]);

  const peekSQSQueue = useCallback((queueUrl: string): void => {
    setSqsPeekInFlight(true);
    setSqsActionStatus("Peeking SQS messages without deleting them.");
    void backendRequest<AwsSqsPeekResult>("aws.sqs.peek", { queueUrl })
      .then((result) => {
        setSqsPeekResult(result);
        setSqsActionStatus(result.summary || "SQS peek completed.");
      })
      .catch((error: unknown) => {
        setSqsActionStatus(error instanceof Error ? error.message : String(error));
      })
      .finally(() => setSqsPeekInFlight(false));
  }, [setSqsActionStatus, setSqsPeekInFlight, setSqsPeekResult]);

  const sendSQSMessage = useCallback((queueUrl: string, messageBody: string): void => {
    setSqsPeekInFlight(true);
    setSqsActionStatus("Sending message to the queue.");
    void backendRequest<{ summary: string }>("aws.sqs.sendMessage", { queueUrl, messageBody })
      .then((result) => {
        setSqsActionStatus(result.summary || "Message sent.");
      })
      .catch((error: unknown) => {
        setSqsActionStatus(error instanceof Error ? error.message : String(error));
      })
      .finally(() => setSqsPeekInFlight(false));
  }, [setSqsActionStatus, setSqsPeekInFlight]);

  const createSQSQueue = useCallback((queueName: string): void => {
    setSqsActionStatus(`Creating SQS queue ${queueName}.`);
    void requestWorkspaceSnapshot("aws.sqs.createQueue", { queueName })
      .then((workspaceResult) => {
        startTransition(() => {
          setWorkspace(workspaceResult);
        });
        setSqsActionStatus(
          workspaceResult.sqsStatusMessage || `Created SQS queue ${queueName}.`,
        );
      })
      .catch((error: unknown) => {
        setSqsActionStatus(error instanceof Error ? error.message : String(error));
      });
  }, [setSqsActionStatus, setWorkspace]);

  const selectSNSRegion = useCallback((region: string): void => {
    setSnsActionStatus(`Loading SNS topics for ${region}.`);
    void requestWorkspaceSnapshot("aws.sns.selectRegion", { region })
      .then((workspaceResult) => {
        startTransition(() => {
          setWorkspace(workspaceResult);
        });
        setSnsActionStatus(
          workspaceResult.snsStatusMessage || `Loaded SNS topics from ${region}.`,
        );
      })
      .catch((error: unknown) => {
        setSnsActionStatus(error instanceof Error ? error.message : String(error));
      });
  }, [setSnsActionStatus, setWorkspace]);

  const refreshSNSInventory = useCallback((): void => {
    const region = workspace.selectedSnsRegion;
    if (!region) {
      setSnsActionStatus("Select a region before refreshing SNS inventory.");
      return;
    }
    selectSNSRegion(region);
  }, [selectSNSRegion, setSnsActionStatus, workspace.selectedSnsRegion]);

  const selectSNSTopic = useCallback((topicArn: string): void => {
    void requestWorkspaceSnapshot("aws.sns.selectTopic", { topicArn })
      .then((workspaceResult) => {
        startTransition(() => {
          setWorkspace(workspaceResult);
        });
        setSnsActionStatus(workspaceResult.snsStatusMessage || "Selected SNS topic.");
      })
      .catch((error: unknown) => {
        setSnsActionStatus(error instanceof Error ? error.message : String(error));
      });
  }, [setSnsActionStatus, setWorkspace]);

  const publishSNSTopic = useCallback((topicArn: string, message: string): void => {
    setSnsActionStatus("Publishing message to the topic.");
    void backendRequest<{ summary: string }>("aws.sns.publish", { topicArn, message })
      .then((result) => {
        setSnsActionStatus(result.summary || "Message published.");
      })
      .catch((error: unknown) => {
        setSnsActionStatus(error instanceof Error ? error.message : String(error));
      });
  }, [setSnsActionStatus]);

  const createSNSTopic = useCallback((topicName: string): void => {
    setSnsActionStatus(`Creating SNS topic ${topicName}.`);
    void requestWorkspaceSnapshot("aws.sns.createTopic", { topicName })
      .then((workspaceResult) => {
        startTransition(() => {
          setWorkspace(workspaceResult);
        });
        setSnsActionStatus(
          workspaceResult.snsStatusMessage || `Created SNS topic ${topicName}.`,
        );
      })
      .catch((error: unknown) => {
        setSnsActionStatus(error instanceof Error ? error.message : String(error));
      });
  }, [setSnsActionStatus, setWorkspace]);

  const selectRDSRegion = useCallback((region: string): void => {
    setRdsActionStatus(`Loading RDS instances for ${region}.`);
    void requestWorkspaceSnapshot("aws.rds.selectRegion", { region })
      .then((workspaceResult) => {
        startTransition(() => {
          setWorkspace(workspaceResult);
        });
        setRdsActionStatus(
          workspaceResult.rdsStatusMessage || `Loaded RDS instances from ${region}.`,
        );
      })
      .catch((error: unknown) => {
        setRdsActionStatus(error instanceof Error ? error.message : String(error));
      });
  }, [setRdsActionStatus, setWorkspace]);

  const refreshRDSInventory = useCallback((): void => {
    const region = workspace.selectedRdsRegion;
    if (!region) {
      setRdsActionStatus("Select a region before refreshing RDS inventory.");
      return;
    }
    selectRDSRegion(region);
  }, [selectRDSRegion, setRdsActionStatus, workspace.selectedRdsRegion]);

  const selectRDSInstance = useCallback((instanceId: string): void => {
    void requestWorkspaceSnapshot("aws.rds.selectInstance", { instanceId })
      .then((workspaceResult) => {
        startTransition(() => {
          setWorkspace(workspaceResult);
        });
        setRdsActionStatus(workspaceResult.rdsStatusMessage || "Selected RDS instance.");
      })
      .catch((error: unknown) => {
        setRdsActionStatus(error instanceof Error ? error.message : String(error));
      });
  }, [setRdsActionStatus, setWorkspace]);

  const selectECSRegion = useCallback((region: string): void => {
    setEcsActionStatus(`Loading ECS clusters for ${region}.`);
    void requestWorkspaceSnapshot("aws.ecs.selectRegion", { region })
      .then((workspaceResult) => {
        startTransition(() => {
          setWorkspace(workspaceResult);
        });
        setEcsActionStatus(
          workspaceResult.ecsStatusMessage || `Loaded ECS clusters from ${region}.`,
        );
      })
      .catch((error: unknown) => {
        setEcsActionStatus(error instanceof Error ? error.message : String(error));
      });
  }, [setEcsActionStatus, setWorkspace]);

  const refreshECSInventory = useCallback((): void => {
    const region = workspace.selectedEcsRegion;
    if (!region) {
      setEcsActionStatus("Select a region before refreshing ECS inventory.");
      return;
    }
    selectECSRegion(region);
  }, [selectECSRegion, setEcsActionStatus, workspace.selectedEcsRegion]);

  const selectECSCluster = useCallback((clusterArn: string): void => {
    void requestWorkspaceSnapshot("aws.ecs.selectCluster", { clusterArn })
      .then((workspaceResult) => {
        startTransition(() => {
          setWorkspace(workspaceResult);
        });
        setEcsActionStatus(workspaceResult.ecsStatusMessage || "Selected ECS cluster.");
      })
      .catch((error: unknown) => {
        setEcsActionStatus(error instanceof Error ? error.message : String(error));
      });
  }, [setEcsActionStatus, setWorkspace]);

  const selectECSService = useCallback((serviceArn: string): void => {
    void requestWorkspaceSnapshot("aws.ecs.selectService", { serviceArn })
      .then((workspaceResult) => {
        startTransition(() => {
          setWorkspace(workspaceResult);
        });
        setEcsActionStatus(workspaceResult.ecsStatusMessage || "Selected ECS service.");
      })
      .catch((error: unknown) => {
        setEcsActionStatus(error instanceof Error ? error.message : String(error));
      });
  }, [setEcsActionStatus, setWorkspace]);

  const selectECSTask = useCallback((taskArn: string): void => {
    void requestWorkspaceSnapshot("aws.ecs.selectTask", { taskArn })
      .then((workspaceResult) => {
        startTransition(() => {
          setWorkspace(workspaceResult);
        });
        setEcsActionStatus(workspaceResult.ecsStatusMessage || "Selected ECS task.");
      })
      .catch((error: unknown) => {
        setEcsActionStatus(error instanceof Error ? error.message : String(error));
      });
  }, [setEcsActionStatus, setWorkspace]);

  const selectApiGatewayRegion = useCallback((region: string): void => {
    setApiGatewayActionStatus(`Loading API Gateway APIs for ${region}.`);
    void requestWorkspaceSnapshot("aws.apigateway.selectRegion", { region })
      .then((workspaceResult) => {
        startTransition(() => {
          setWorkspace(workspaceResult);
        });
        setApiGatewayActionStatus(
          workspaceResult.apiGatewayStatusMessage || `Loaded API Gateway APIs from ${region}.`,
        );
      })
      .catch((error: unknown) => {
        setApiGatewayActionStatus(error instanceof Error ? error.message : String(error));
      });
  }, [setApiGatewayActionStatus, setWorkspace]);

  const refreshApiGatewayInventory = useCallback((): void => {
    const region = workspace.selectedApiGatewayRegion;
    if (!region) {
      setApiGatewayActionStatus("Select a region before refreshing API Gateway inventory.");
      return;
    }
    selectApiGatewayRegion(region);
  }, [selectApiGatewayRegion, setApiGatewayActionStatus, workspace.selectedApiGatewayRegion]);

  const selectApiGatewayApi = useCallback((apiKey: string): void => {
    void requestWorkspaceSnapshot("aws.apigateway.selectApi", { apiKey })
      .then((workspaceResult) => {
        startTransition(() => {
          setWorkspace(workspaceResult);
        });
        setApiGatewayActionStatus(workspaceResult.apiGatewayStatusMessage || "Selected API Gateway API.");
      })
      .catch((error: unknown) => {
        setApiGatewayActionStatus(error instanceof Error ? error.message : String(error));
      });
  }, [setApiGatewayActionStatus, setWorkspace]);

  const selectLogsRegion = useCallback((region: string): void => {
    setLogsActionStatus(`Loading log groups for ${region}.`);
    void requestWorkspaceSnapshot("aws.logs.selectRegion", { region })
      .then((workspaceResult) => {
        startTransition(() => {
          setWorkspace(workspaceResult);
        });
        setLogsActionStatus(
          workspaceResult.logsStatusMessage || `Loaded log groups from ${region}.`,
        );
      })
      .catch((error: unknown) => {
        setLogsActionStatus(error instanceof Error ? error.message : String(error));
      });
  }, [setLogsActionStatus, setWorkspace]);

  const refreshLogsInventory = useCallback((): void => {
    const region = workspace.selectedLogsRegion;
    if (!region) {
      setLogsActionStatus("Select a region before refreshing log groups.");
      return;
    }
    selectLogsRegion(region);
  }, [selectLogsRegion, setLogsActionStatus, workspace.selectedLogsRegion]);

  const selectLogGroup = useCallback((logGroupName: string): void => {
    void requestWorkspaceSnapshot("aws.logs.selectLogGroup", { logGroupName })
      .then((workspaceResult) => {
        startTransition(() => {
          setWorkspace(workspaceResult);
        });
        setLogsActionStatus(workspaceResult.logsStatusMessage || "Selected log group.");
      })
      .catch((error: unknown) => {
        setLogsActionStatus(error instanceof Error ? error.message : String(error));
      });
  }, [setLogsActionStatus, setWorkspace]);

  const refreshIAMInventory = useCallback((): void => {
    setIamActionStatus("Refreshing IAM roles and policies.");
    void requestWorkspaceSnapshot("workspace.get")
      .then((workspaceResult) => {
        startTransition(() => {
          setWorkspace(workspaceResult);
        });
        setIamActionStatus(workspaceResult.iamStatusMessage || "IAM inventory refreshed.");
      })
      .catch((error: unknown) => {
        setIamActionStatus(error instanceof Error ? error.message : String(error));
      });
  }, [setIamActionStatus, setWorkspace]);

  const selectIAMRole = useCallback((roleName: string): void => {
    void requestWorkspaceSnapshot("aws.iam.selectRole", { roleName })
      .then((workspaceResult) => {
        startTransition(() => {
          setWorkspace(workspaceResult);
        });
        setIamActionStatus(workspaceResult.iamStatusMessage || "Selected IAM role.");
      })
      .catch((error: unknown) => {
        setIamActionStatus(error instanceof Error ? error.message : String(error));
      });
  }, [setIamActionStatus, setWorkspace]);

  const applyS3PrefixFilter = useCallback((prefix: string): void => {
    const requestId = s3PrefixRequestIdRef.current + 1;
    s3PrefixRequestIdRef.current = requestId;
    void requestWorkspaceSnapshot("aws.s3.setPrefixFilter", { prefix }).then((workspaceResult) => {
      if (requestId === s3PrefixRequestIdRef.current) {
        startTransition(() => {
          setWorkspace(workspaceResult);
        });
      }
    });
  }, [s3PrefixRequestIdRef, setWorkspace]);

  return {
    refreshEC2Inventory,
    selectEC2Region,
    selectEC2Instance,
    invokeEC2LifecycleAction,
    refreshLambdaInventory,
    selectLambdaRegion,
    selectLambdaFunction,
    invokeLambda,
    createLambda,
    refreshDynamoDBInventory,
    selectDynamoDBRegion,
    selectDynamoDBTable,
    putDynamoDBItem,
    deleteDynamoDBItem,
    refreshSQSInventory,
    selectSQSRegion,
    selectSQSQueue,
    peekSQSQueue,
    sendSQSMessage,
    createSQSQueue,
    refreshSNSInventory,
    selectSNSRegion,
    selectSNSTopic,
    publishSNSTopic,
    createSNSTopic,
    refreshRDSInventory,
    selectRDSRegion,
    selectRDSInstance,
    refreshECSInventory,
    selectECSRegion,
    selectECSCluster,
    selectECSService,
    selectECSTask,
    refreshApiGatewayInventory,
    selectApiGatewayRegion,
    selectApiGatewayApi,
    refreshLogsInventory,
    selectLogsRegion,
    selectLogGroup,
    refreshIAMInventory,
    selectIAMRole,
    applyS3PrefixFilter,
  };
}
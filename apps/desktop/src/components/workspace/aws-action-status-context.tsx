// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import {
  createContext,
  useContext,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";

import type {
  AwsLambdaInvokeResult,
  AwsS3PresignResult,
  AwsSqsPeekResult,
  JobLifecycle,
  UrlInspection,
  UrlValidationResult,
} from "@/types/backend";

/** AWS inventory action feedback: status strings, in-flight flags, and results. */
export type AwsActionStatusContextValue = {
  s3UploadStatus: string;
  setS3UploadStatus: Dispatch<SetStateAction<string>>;
  s3SignedUrlStatus: string;
  setS3SignedUrlStatus: Dispatch<SetStateAction<string>>;
  s3SignedUrlResult?: AwsS3PresignResult;
  s3UrlInspection?: UrlInspection;
  setS3UrlInspection: Dispatch<SetStateAction<UrlInspection | undefined>>;
  s3UrlValidation?: UrlValidationResult;
  ec2ActionStatus: string;
  ec2ActionInFlight: boolean;
  ec2ActionHistory: Array<{
    jobId: string;
    status: JobLifecycle;
    message: string;
    completedAt?: string;
  }>;
  lambdaActionStatus: string;
  lambdaInvokeResult: AwsLambdaInvokeResult | null;
  lambdaInvokeInFlight: boolean;
  lambdaCreateInFlight: boolean;
  dynamodbActionStatus: string;
  sqsActionStatus: string;
  sqsPeekResult: AwsSqsPeekResult | null;
  sqsPeekInFlight: boolean;
  snsActionStatus: string;
  rdsActionStatus: string;
  ecsActionStatus: string;
  eksActionStatus: string;
  cloudFormationActionStatus: string;
  eventBridgeActionStatus: string;
  route53ActionStatus: string;
  elbActionStatus: string;
  kmsActionStatus: string;
  apiGatewayActionStatus: string;
  secretsManagerActionStatus: string;
  logsActionStatus: string;
  iamActionStatus: string;
};

const AwsActionStatusContext = createContext<AwsActionStatusContextValue | null>(null);

export function AwsActionStatusProvider({
  value,
  children,
}: {
  value: AwsActionStatusContextValue;
  children: ReactNode;
}) {
  return (
    <AwsActionStatusContext.Provider value={value}>{children}</AwsActionStatusContext.Provider>
  );
}

export function useAwsActionStatusContext(): AwsActionStatusContextValue {
  const value = useContext(AwsActionStatusContext);
  if (!value) {
    throw new Error("useAwsActionStatusContext must be used within AwsActionStatusProvider");
  }
  return value;
}

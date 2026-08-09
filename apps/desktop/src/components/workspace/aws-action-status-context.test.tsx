// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, expectTypeOf, it, vi } from "vitest";

import {
  AwsActionStatusProvider,
  type AwsActionStatusContextValue,
  useAwsActionStatusContext,
} from "./aws-action-status-context";
import type { WorkspaceTabRouterProps } from "./workspace-tab-router-props";

function createAwsActionStatus(): AwsActionStatusContextValue {
  return {
    s3UploadStatus: "",
    setS3UploadStatus: vi.fn(),
    s3SignedUrlStatus: "",
    setS3SignedUrlStatus: vi.fn(),
    s3SignedUrlResult: undefined,
    s3UrlInspection: undefined,
    setS3UrlInspection: vi.fn(),
    s3UrlValidation: undefined,
    ec2ActionStatus: "ready",
    ec2ActionInFlight: false,
    ec2ActionHistory: [],
    lambdaActionStatus: "",
    lambdaInvokeResult: null,
    lambdaInvokeInFlight: false,
    lambdaCreateInFlight: false,
    dynamodbActionStatus: "",
    sqsActionStatus: "",
    sqsPeekResult: null,
    sqsPeekInFlight: false,
    snsActionStatus: "",
    rdsActionStatus: "",
    ecsActionStatus: "",
    eksActionStatus: "",
    cloudFormationActionStatus: "",
    eventBridgeActionStatus: "",
    route53ActionStatus: "",
    elbActionStatus: "",
    kmsActionStatus: "",
    apiGatewayActionStatus: "",
    secretsManagerActionStatus: "",
    logsActionStatus: "",
    iamActionStatus: "",
  };
}

function AwsActionStatusProbe() {
  const status = useAwsActionStatusContext();
  return (
    <button type="button" onClick={() => status.setS3UploadStatus("uploading")}>
      {status.ec2ActionStatus || "empty"}
    </button>
  );
}

describe("AwsActionStatusProvider", () => {
  it("forwards AWS action status values to consumers", () => {
    const value = createAwsActionStatus();

    render(
      <AwsActionStatusProvider value={value}>
        <AwsActionStatusProbe />
      </AwsActionStatusProvider>,
    );

    expect(screen.getByRole("button", { name: "ready" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "ready" }));
    expect(value.setS3UploadStatus).toHaveBeenCalledWith("uploading");
  });

  it("fails fast when a consumer has no provider", () => {
    expect(() => render(<AwsActionStatusProbe />)).toThrow(
      "useAwsActionStatusContext must be used within AwsActionStatusProvider",
    );
  });

  it("keeps AWS action-status fields out of the router prop contract", () => {
    type LegacyAwsStatusProp =
      | "s3UploadStatus"
      | "setS3UploadStatus"
      | "s3SignedUrlStatus"
      | "setS3SignedUrlStatus"
      | "s3SignedUrlResult"
      | "s3UrlInspection"
      | "setS3UrlInspection"
      | "s3UrlValidation"
      | "ec2ActionStatus"
      | "ec2ActionInFlight"
      | "ec2ActionHistory"
      | "lambdaActionStatus"
      | "lambdaInvokeResult"
      | "lambdaInvokeInFlight"
      | "lambdaCreateInFlight"
      | "dynamodbActionStatus"
      | "sqsActionStatus"
      | "sqsPeekResult"
      | "sqsPeekInFlight"
      | "snsActionStatus"
      | "rdsActionStatus"
      | "ecsActionStatus"
      | "eksActionStatus"
      | "cloudFormationActionStatus"
      | "eventBridgeActionStatus"
      | "route53ActionStatus"
      | "elbActionStatus"
      | "kmsActionStatus"
      | "apiGatewayActionStatus"
      | "secretsManagerActionStatus"
      | "logsActionStatus"
      | "iamActionStatus";

    type ThreadedAwsStatusProp = Extract<keyof WorkspaceTabRouterProps, LegacyAwsStatusProp>;
    expectTypeOf<ThreadedAwsStatusProp>().toEqualTypeOf<never>();
  });
});

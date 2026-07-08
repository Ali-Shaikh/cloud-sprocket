// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { describe, expect, it } from "vitest";

import {
  formatDeploymentTargetLabel,
  formatLocalTargetLabel,
  localRuntimeProvider,
  proCapabilityHint,
} from "./local-runtime-labels";

describe("local-runtime-labels", () => {
  it("maps runtimes to cloud providers", () => {
    expect(localRuntimeProvider("localstack")).toBe("aws");
    expect(localRuntimeProvider("floci-az")).toBe("azure");
    expect(localRuntimeProvider("docker-compose")).toBe("neutral");
  });

  it("formats local target labels with provider and engine", () => {
    expect(formatLocalTargetLabel("localstack")).toBe("Local runtime (AWS · LocalStack)");
    expect(formatLocalTargetLabel("floci-az")).toBe("Local runtime (Azure · floci-az)");
    expect(formatLocalTargetLabel("localstack", true)).toContain("licensed runtime");
  });

  it("formats cloud deployment targets", () => {
    expect(
      formatDeploymentTargetLabel({
        local: false,
        providerId: "aws",
        profileId: "default",
        runtimeId: undefined,
      }),
    ).toBe("aws · default");
  });

  it("builds a pro capability hint from runtime ids", () => {
    expect(proCapabilityHint(["localstack"])).toContain("LocalStack");
  });
});
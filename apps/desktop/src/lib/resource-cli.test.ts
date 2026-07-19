// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { describe, expect, it } from "vitest";

import { selectedResourceCli } from "./resource-cli";
import type { WorkspaceSnapshot } from "@/types/backend";

describe("selectedResourceCli", () => {
  it("builds an aws lambda get-function command", () => {
    const snippet = selectedResourceCli(
      {
        selectedLambdaFunctionName: "demo-fn",
        selectedLambdaRegion: "eu-west-1",
      } as WorkspaceSnapshot,
      "aws",
      "lambda",
    );
    expect(snippet?.command).toContain("aws lambda get-function --function-name demo-fn");
    expect(snippet?.command).toContain("--region eu-west-1");
  });

  it("builds an az storage account command with resource group when selected", () => {
    const snippet = selectedResourceCli(
      {
        selectedAzureStorageAccount: "stlab",
        selectedAzureResourceGroup: "rg-lab",
      } as WorkspaceSnapshot,
      "azure",
      "azure-storage",
    );
    expect(snippet?.command).toBe(
      "az storage account show --name stlab --resource-group rg-lab",
    );
  });

  it("requires resource group for az webapp show", () => {
    expect(
      selectedResourceCli(
        { selectedAzureWebAppName: "lab-web" } as WorkspaceSnapshot,
        "azure",
        "azure-app-service",
      ),
    ).toBeNull();
    const snippet = selectedResourceCli(
      {
        selectedAzureWebAppName: "lab-web",
        selectedAzureResourceGroup: "rg-lab",
      } as WorkspaceSnapshot,
      "azure",
      "azure-app-service",
    );
    expect(snippet?.command).toBe(
      "az webapp show --name lab-web --resource-group rg-lab",
    );
  });

  it("returns null when nothing is selected", () => {
    expect(selectedResourceCli({} as WorkspaceSnapshot, "aws", "s3")).toBeNull();
  });
});

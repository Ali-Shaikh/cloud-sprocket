// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { describe, expect, it } from "vitest";

import type { ProfileSummary, RecipeManifest } from "@/types/backend";

import type { RecipeVariable } from "@/types/backend";

import {
  groupVariables,
  isFlociAzureProfile,
  isVariableVisible,
  magentoComposeDir,
  magentoComposePlanWarnings,
  manifestCloudOnlyAWS,
  manifestCloudOnlyAzure,
  normaliseMagentoComposeValues,
} from "./shared";

describe("deployShared helpers", () => {
  it("detects the floci-az local Azure profile", () => {
    const profile: ProfileSummary = {
      providerId: "azure",
      profileId: "cloudsprocket-floci-az",
      displayName: "CloudSprocket floci-az (local)",
      summary: "local",
      sourcePaths: [],
      attributes: [{ label: "Tenant ID", value: "cloudsprocket-local" }],
      authMethods: [],
    };
    expect(isFlociAzureProfile(profile)).toBe(true);
  });

  it("treats cloud-only Azure recipes as requiring a subscription profile", () => {
    const manifest: RecipeManifest = {
      apiVersion: "cloudsprocket.recipe/v1",
      id: "magento-commerce-azure",
      version: "0.1.0",
      name: "Magento commerce (Azure)",
      engine: { type: "opentofu", minVersion: "1.6.0" },
      local: { runtimes: [] },
      providers: ["azure"],
    };
    expect(manifestCloudOnlyAzure(manifest)).toBe(true);
  });

  it("treats cloud-only AWS recipes as requiring a real AWS profile", () => {
    const manifest: RecipeManifest = {
      apiVersion: "cloudsprocket.recipe/v1",
      id: "magento-commerce-aws",
      version: "0.1.0",
      name: "Magento commerce (AWS)",
      engine: { type: "opentofu", minVersion: "1.6.0" },
      local: { runtimes: [] },
      providers: ["aws"],
    };
    expect(manifestCloudOnlyAWS(manifest)).toBe(true);
  });

  it("filters variables with visibleWhen", () => {
    const variables: RecipeVariable[] = [
      {
        name: "stack_profile",
        type: "string",
        required: false,
        group: "Stack",
        widget: "select",
        options: ["simple", "official"],
      },
      {
        name: "magento_public_key",
        type: "string",
        required: false,
        group: "Keys",
        widget: "text",
        visibleWhen: { variable: "stack_profile", equals: "official" },
      },
    ];
    expect(isVariableVisible(variables[1], { stack_profile: "simple" })).toBe(false);
    expect(isVariableVisible(variables[1], { stack_profile: "official" })).toBe(true);
    expect(groupVariables(variables, { stack_profile: "simple" }).map((g) => g.variables.map((v) => v.name))).toEqual([
      ["stack_profile"],
    ]);
  });

  it("derives magento compose_dir from stack profile", () => {
    expect(magentoComposeDir("simple")).toBe("compose/simple");
    expect(magentoComposeDir("official")).toBe("compose/official");
    expect(normaliseMagentoComposeValues({ stack_profile: "official" }).compose_dir).toBe("compose/official");
  });

  it("warns when official magento keys are missing", () => {
    const warnings = magentoComposePlanWarnings("magento-commerce-compose", {
      stack_profile: "official",
      magento_public_key: "",
      magento_private_key: "",
    });
    expect(warnings.some((warning) => warning.includes("Adobe Marketplace keys"))).toBe(true);
  });
});
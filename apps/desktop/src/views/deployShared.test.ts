// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { describe, expect, it } from "vitest";

import type { ProfileSummary, RecipeManifest } from "@/types/backend";

import { isFlociAzureProfile, manifestCloudOnlyAWS, manifestCloudOnlyAzure } from "./deployShared";

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
});
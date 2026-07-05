// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { describe, expect, it } from "vitest";

import {
  groupCatalogueByProvider,
  isProviderEnabled,
  isServiceEnabled,
  normaliseServicePreferences,
  setAllProviderServices,
  toggleProvider,
  toggleService,
} from "./service-preferences";
import type { ServiceCatalogEntry, ServicePreferences } from "@/types/backend";

const catalogue: ServiceCatalogEntry[] = [
  {
    providerId: "aws",
    serviceId: "s3",
    label: "S3",
    summary: "Buckets",
    detail: "Buckets",
    category: "service",
    enabled: true,
  },
  {
    providerId: "aws",
    serviceId: "ec2",
    label: "EC2",
    summary: "Instances",
    detail: "Instances",
    category: "service",
    enabled: false,
  },
];

describe("service-preferences", () => {
  it("groups catalogue entries by provider", () => {
    const groups = groupCatalogueByProvider(catalogue);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.providerId).toBe("aws");
    expect(groups[0]?.enabledCount).toBe(1);
  });

  it("toggles provider and service state", () => {
    const initial: ServicePreferences = { disabledProviders: [], disabledServices: {} };
    const disabledProvider = toggleProvider(initial, "aws", false);
    expect(isServiceEnabled(disabledProvider, "aws", "s3")).toBe(false);

    const disabledService = toggleService(initial, "aws", "s3", false);
    expect(isServiceEnabled(disabledService, "aws", "s3")).toBe(false);
    expect(isServiceEnabled(disabledService, "aws", "ec2")).toBe(true);
  });

  it("disables all services for a provider", () => {
    const initial: ServicePreferences = { disabledProviders: [], disabledServices: {} };
    const next = setAllProviderServices(initial, "aws", ["s3", "ec2"], false);
    expect(isServiceEnabled(next, "aws", "s3")).toBe(false);
    expect(isServiceEnabled(next, "aws", "ec2")).toBe(false);
  });

  it("treats null disabledProviders from the backend as an empty list", () => {
    const malformed = {
      disabledProviders: null,
      disabledServices: null,
    } as unknown as ServicePreferences;

    expect(normaliseServicePreferences(malformed)).toEqual({
      disabledProviders: [],
      disabledServices: {},
    });
    expect(isProviderEnabled(malformed, "aws")).toBe(true);
    expect(isServiceEnabled(malformed, "aws", "s3")).toBe(true);
    expect(toggleProvider(malformed, "aws", false).disabledProviders).toEqual(["aws"]);
  });
});
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { describe, expect, it } from "vitest";

import {
  formatHiddenResourceHit,
  formatHiddenResourceSummary,
  hiddenResourceChipLabel,
} from "./hidden-resources";
import type { HiddenResourceHit } from "@/types/backend";

const hits: HiddenResourceHit[] = [
  {
    providerId: "aws",
    serviceId: "rds",
    label: "RDS",
    resourceCount: 3,
  },
  {
    providerId: "aws",
    serviceId: "sns",
    label: "SNS",
    resourceCount: 1,
  },
];

describe("hidden-resources", () => {
  it("formats chip and summary copy", () => {
    expect(hiddenResourceChipLabel(hits)).toBe("Resources exist in 2 disabled services");
    expect(formatHiddenResourceHit(hits[1])).toBe("SNS (1 resource)");
    expect(formatHiddenResourceSummary(hits)).toBe(
      "Resources exist in 2 disabled services: RDS (3 resources), SNS (1 resource).",
    );
  });
});
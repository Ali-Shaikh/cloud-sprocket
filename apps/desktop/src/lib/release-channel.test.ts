// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { describe, expect, it } from "vitest";

import {
  RELEASE_CHANNEL_DESCRIPTION,
  RELEASE_CHANNEL_LABEL,
  RELEASE_CHANNEL_TAGLINE,
} from "./release-channel";

describe("release channel copy", () => {
  it("states developer preview and production readiness expectations", () => {
    expect(RELEASE_CHANNEL_LABEL).toBe("Developer Preview");
    expect(RELEASE_CHANNEL_TAGLINE.toLowerCase()).toContain("not production-ready");
    expect(RELEASE_CHANNEL_TAGLINE.toLowerCase()).toContain("breaking changes");
    expect(RELEASE_CHANNEL_DESCRIPTION.toLowerCase()).toContain("developer preview");
  });
});
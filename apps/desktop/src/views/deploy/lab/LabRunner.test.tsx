// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ThemeProvider } from "@/lib/theme";
import type { Deployment, LabSpec } from "@/types/backend";

import { LabRunner } from "./lab-runner";

vi.mock("@/lib/backend", () => ({
  getLabSession: vi.fn().mockResolvedValue(null),
  startLabSession: vi.fn(),
  verifyLabStep: vi.fn(),
  runLabAction: vi.fn(),
  resetLabSession: vi.fn(),
  subscribeToBackendEvent: vi.fn().mockResolvedValue(() => {}),
}));

const labSpec: LabSpec = {
  difficulty: "beginner",
  estimatedMinutes: 15,
  objectives: ["Inspect the DynamoDB table"],
  steps: [
    {
      id: "inspect-table",
      title: "Open the table",
      body: "Browse the table in the DynamoDB tab.",
      actions: [{ type: "open-tab", tab: "aws-dynamodb", focus: "demo-table" }],
      verify: [{ type: "dynamodb.table-exists", table: "demo-table" }],
      hints: ["Use the inventory list on the left."],
    },
  ],
};

const deployment: Deployment = {
  id: "dep-lab-1",
  recipeId: "lab-dynamodb-aws",
  name: "DynamoDB lab",
  providerId: "aws",
  profileId: "sandbox",
  local: true,
  variables: {},
  status: "applied",
  createdAt: "2026-07-08T10:00:00.000Z",
  updatedAt: "2026-07-08T10:05:00.000Z",
};

describe("LabRunner", () => {
  it("renders the start lab prompt before a session exists", async () => {
    render(
      <ThemeProvider>
        <LabRunner deployment={deployment} labSpec={labSpec} providerId="aws" />
      </ThemeProvider>,
    );

    expect(await screen.findByText("Guided lab")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /start lab/i })).toBeInTheDocument();
    expect(screen.getByText("Inspect the DynamoDB table")).toBeInTheDocument();
  });
});
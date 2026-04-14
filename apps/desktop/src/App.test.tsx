import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import type {
  ActivityLogEntry,
  ProfileSummary,
  ProviderSummary,
  SessionSnapshot,
} from "./types/backend";

const providerFixtures: ProviderSummary[] = [
  {
    providerId: "aws",
    label: "AWS",
    state: "configured",
    summary: "AWS config detected.",
    profileCount: 1,
    commandPath: "aws",
    locations: ["~/.aws/config"],
  },
];

const profileFixtures: ProfileSummary[] = [
  {
    providerId: "aws",
    profileId: "sandbox",
    displayName: "sandbox",
    summary: "AWS sandbox profile.",
    sourcePaths: ["~/.aws/config"],
    attributes: [{ label: "Region", value: "us-east-1" }],
    authMethods: [
      { method: "cli", label: "CLI", summary: "AWS CLI detected.", available: true },
      { method: "sso", label: "SSO", summary: "SSO metadata detected.", available: true },
      { method: "local-files", label: "Local Files", summary: "Read-only data.", available: true },
    ],
  },
];

let sessionFixture: SessionSnapshot;
let logFixtures: ActivityLogEntry[];

vi.mock("./lib/backend", () => ({
  backendRequest: vi.fn(async (method: string) => {
    switch (method) {
      case "providers.list":
        return providerFixtures;
      case "profiles.list":
        return profileFixtures;
      case "session.get":
        return sessionFixture;
      case "logs.list":
        return logFixtures;
      case "actions.invoke":
        return {
          jobId: "job-1",
          label: "Refresh Discovery",
          status: "queued",
          message: "Refreshing discovery.",
        };
      default:
        return sessionFixture;
    }
  }),
  subscribeToBackendEvent: vi.fn(async () => () => undefined),
}));

describe("App", () => {
  beforeEach(() => {
    sessionFixture = {
      currentProviderId: "aws",
      selectedProfileId: "sandbox",
      selectedAuthMethod: "cli",
      isLocked: false,
      availableAuthMethods: profileFixtures[0].authMethods,
      workspaceTabs: [],
    };
    logFixtures = [
      {
        id: 1,
        level: "info",
        message: "Initial discovery loaded.",
        timestamp: "2026-04-14T09:00:00Z",
      },
    ];
  });

  it("renders the session setup view while unlocked", async () => {
    render(<App />);

    expect(await screen.findByText("Session Setup")).toBeInTheDocument();
    expect(screen.getByText("Providers")).toBeInTheDocument();
    expect(screen.getByText("Authentication Path")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Lock Session" })).toBeInTheDocument();
  });

  it("renders the locked workspace tabs when the session is locked", async () => {
    sessionFixture = {
      ...sessionFixture,
      isLocked: true,
      lockedProviderId: "aws",
      lockedProfileId: "sandbox",
      lockedAuthMethod: "cli",
      workspaceTabs: [
        {
          tabId: "overview",
          label: "Overview",
          summary: "Summary",
          detail: "Overview panel",
        },
        {
          tabId: "s3",
          label: "S3",
          summary: "S3 summary",
          detail: "S3 panel",
        },
      ],
    };

    render(<App />);

    expect(await screen.findByText("Locked Workspace")).toBeInTheDocument();
    expect(screen.getByText("Overview")).toBeInTheDocument();
    expect(screen.getByText("S3")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Unlock" })).toBeInTheDocument();
  });
});

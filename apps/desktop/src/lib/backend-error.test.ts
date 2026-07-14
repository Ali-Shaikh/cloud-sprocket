// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import {
  BackendRequestError,
  hasBackendErrorCode,
  normaliseBackendRequestError,
} from "./backend-error";

describe("normaliseBackendRequestError", () => {
  it("preserves typed backend errors", () => {
    const error = normaliseBackendRequestError({
      code: "provider_timeout",
      message: "The provider operation timed out.",
    });

    expect(error).toBeInstanceOf(BackendRequestError);
    expect(error.code).toBe("provider_timeout");
    expect(error.message).toBe("The provider operation timed out.");
  });

  it("accepts serialised Tauri error payloads", () => {
    const error = normaliseBackendRequestError(
      '{"code":"method_not_found","message":"This operation is unavailable."}',
    );

    expect(hasBackendErrorCode(error, "method_not_found")).toBe(true);
  });

  it("does not expose unknown rejection details", () => {
    const error = normaliseBackendRequestError(
      new Error("provider secret arn:aws:secretsmanager:example"),
    );

    expect(error.code).toBe("backend_error");
    expect(error.message).toBe("The backend request failed.");
  });
});

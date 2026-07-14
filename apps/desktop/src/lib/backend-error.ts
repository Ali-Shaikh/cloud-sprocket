// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

const FALLBACK_CODE = "backend_error";
const FALLBACK_MESSAGE = "The backend request failed.";

export class BackendRequestError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "BackendRequestError";
    this.code = code;
  }
}

function errorPayload(error: unknown): Record<string, unknown> | undefined {
  if (error && typeof error === "object") {
    return error as Record<string, unknown>;
  }
  if (typeof error !== "string") {
    return undefined;
  }
  try {
    const parsed: unknown = JSON.parse(error);
    return parsed && typeof parsed === "object"
      ? (parsed as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}

export function normaliseBackendRequestError(error: unknown): BackendRequestError {
  if (error instanceof BackendRequestError) {
    return error;
  }

  const payload = errorPayload(error);
  if (typeof payload?.code === "string" && typeof payload.message === "string") {
    return new BackendRequestError(payload.code, payload.message);
  }

  return new BackendRequestError(FALLBACK_CODE, FALLBACK_MESSAGE);
}

export function hasBackendErrorCode(error: unknown, code: string): boolean {
  if (error instanceof BackendRequestError) {
    return error.code === code;
  }
  return errorPayload(error)?.code === code;
}

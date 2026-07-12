// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

export const ONBOARDING_COMPLETED_KEY = "cloudsprocket.onboarding.v1.completed";
export const ONBOARDING_STEP_KEY = "cloudsprocket.onboarding.v1.step";

/** The bundled beginner lab the wizard's final step deep-links into. */
export const FIRST_LAB_RECIPE_ID = "lab-dynamodb-aws";

export function isOnboardingComplete(): boolean {
  try {
    return window.localStorage.getItem(ONBOARDING_COMPLETED_KEY) === "true";
  } catch {
    return false;
  }
}

export function markOnboardingComplete(): void {
  try {
    window.localStorage.setItem(ONBOARDING_COMPLETED_KEY, "true");
    window.localStorage.removeItem(ONBOARDING_STEP_KEY);
  } catch {
    /* Storage may be unavailable. The router still hides the wizard for this session. */
  }
}

/** Re-arms the wizard, e.g. after Reset app data restores default preferences. */
export function clearOnboardingState(): void {
  try {
    window.localStorage.removeItem(ONBOARDING_COMPLETED_KEY);
    window.localStorage.removeItem(ONBOARDING_STEP_KEY);
  } catch {
    /* Storage may be unavailable; there is nothing to clear then. */
  }
}

export function readOnboardingStep(maxStep: number): number {
  try {
    const step = Number(window.localStorage.getItem(ONBOARDING_STEP_KEY));
    return Number.isInteger(step) && step >= 0 && step <= maxStep ? step : 0;
  } catch {
    return 0;
  }
}

export function writeOnboardingStep(step: number): void {
  try {
    window.localStorage.setItem(ONBOARDING_STEP_KEY, String(step));
  } catch {
    /* Storage may be unavailable. Progress stays in memory for this mount. */
  }
}

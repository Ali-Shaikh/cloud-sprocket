// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

/// <reference types="vite/client" />

/**
 * Compile-time flag injected by Vite/Vitest.
 * true  – browser / unit-test builds (include backend-mock via dynamic import)
 * false – Tauri CLI builds (TAURI_ENV_PLATFORM set); mock is tree-shaken out
 */
declare const __ENABLE_BROWSER_MOCK__: boolean;

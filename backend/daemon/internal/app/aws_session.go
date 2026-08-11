// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package app

// AWS write/session helpers for inventory mutations live in internal/app/aws
// (AuthorizeWrite*, FinishWriteAction, withLockedAWSWorkspace). The old façade
// copies were unused after F-029 Phase 4 and were removed to avoid dual stacks.

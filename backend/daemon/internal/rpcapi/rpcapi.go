// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

// Package rpcapi holds the small shared contracts between the JSON-RPC transport
// (package rpc) and the application service (package app).
//
// Keeping these types out of app lets the transport layer depend only on this
// package, avoiding a cycle and preserving a clean app -> rpc wiring direction.
package rpcapi

// PublicError exposes a stable, safe error contract to the local UI while the
// underlying diagnostic remains available to the daemon logger.
type PublicError interface {
	error
	JSONRPCCode() int
	StableCode() string
	SafeMessage() string
}

// Notifier sends unsolicited JSON-RPC notifications on the transport (for
// example progress events during long-running operations).
type Notifier interface {
	Notify(method string, payload any) error
}

// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package app

import "fmt"

// PublicError exposes a stable, safe error contract to the local UI while the
// underlying diagnostic remains available to the daemon logger.
type PublicError interface {
	error
	JSONRPCCode() int
	StableCode() string
	SafeMessage() string
}

type publicError struct {
	jsonRPCCode int
	stableCode  string
	safeMessage string
	cause       error
}

func (e *publicError) Error() string {
	if e.cause != nil {
		return e.cause.Error()
	}
	return e.safeMessage
}

func (e *publicError) Unwrap() error {
	return e.cause
}

func (e *publicError) JSONRPCCode() int {
	return e.jsonRPCCode
}

func (e *publicError) StableCode() string {
	return e.stableCode
}

func (e *publicError) SafeMessage() string {
	return e.safeMessage
}

func methodNotFoundError(method string) error {
	return &publicError{
		jsonRPCCode: -32601,
		stableCode:  "method_not_found",
		safeMessage: "This backend operation is not available.",
		cause:       fmt.Errorf("unknown backend method: %s", method),
	}
}

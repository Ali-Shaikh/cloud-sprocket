// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package deploy

import (
	"context"
	"errors"
	"fmt"
	"strings"
)

// FaultKind is an abstract chaos fault that lab steps can request.
// Runtimes map kinds they support; others surface as unavailable.
type FaultKind string

const (
	// FaultKindServiceError makes a named dependency fail requests.
	FaultKindServiceError FaultKind = "service-error"
	// FaultKindLatency injects delay on a named dependency path.
	FaultKindLatency FaultKind = "latency"
	// FaultKindPartition isolates a dependency (network partition).
	FaultKindPartition FaultKind = "partition"
	// FaultKindPause stops a container or process for a dependency.
	FaultKindPause FaultKind = "pause"
)

// Fault is a concrete fault request from a lab step.
type Fault struct {
	Kind FaultKind
	// Target names the dependency (service, container, queue worker, etc.).
	Target string
	// Params hold kind-specific options (e.g. latency milliseconds).
	Params map[string]string
}

// FaultInjector injects runtime faults for chaos labs. Implementations must
// auto-revert via the returned function and report only supported kinds.
// Real cloud targets use NoopFaultInjector so chaos steps stay local-only.
//
// Contract: on success, Inject returns a non-nil revert func that is safe to
// call more than once. On error, revert is always nil — callers must not
// invoke it.
type FaultInjector interface {
	// Capabilities lists fault kinds this injector can apply.
	// Always returns a non-nil slice (empty means no chaos support).
	Capabilities() []FaultKind
	// Inject applies a fault. On success, revert undoes it; callers must call
	// it when the step ends, the lab resets, or the session closes. Revert is
	// idempotent. On error, revert is nil.
	Inject(ctx context.Context, fault Fault) (revert func() error, err error)
}

// ErrFaultUnsupported means the runtime cannot apply the requested fault kind.
var ErrFaultUnsupported = errors.New("fault kind is not supported on this runtime")

// ErrFaultNotImplemented means the kind is advertised but the inject backend
// is not wired yet (compose stub until first chaos labs land).
var ErrFaultNotImplemented = errors.New("fault inject backend is not implemented yet")

// NoopFaultInjector never injects faults (cloud targets and local runtimes
// without a fault backend). Capabilities is empty so the UI can show
// "local runtimes only" for chaos steps.
type NoopFaultInjector struct{}

// Capabilities returns an empty non-nil slice (JSON encodes as []).
func (NoopFaultInjector) Capabilities() []FaultKind {
	return []FaultKind{}
}

// Inject always returns ErrFaultUnsupported and a nil revert.
func (NoopFaultInjector) Inject(_ context.Context, fault Fault) (func() error, error) {
	kind := normaliseFaultKind(fault.Kind)
	if kind == "" {
		return nil, fmt.Errorf("%w: empty fault kind", ErrFaultUnsupported)
	}
	return nil, fmt.Errorf("%w: %s", ErrFaultUnsupported, kind)
}

// Supports reports whether kind is in the injector's capabilities list.
func Supports(injector FaultInjector, kind FaultKind) bool {
	if injector == nil {
		return false
	}
	want := normaliseFaultKind(kind)
	for _, supported := range injector.Capabilities() {
		if normaliseFaultKind(supported) == want {
			return true
		}
	}
	return false
}

func normaliseFaultKind(kind FaultKind) FaultKind {
	return FaultKind(strings.TrimSpace(string(kind)))
}

// FaultInjectorForTarget returns a chaos injector for the deploy target id.
// Compose-based targets get a stub that advertises container-level faults
// (implementation lands with the first chaos labs). Others are no-op.
func FaultInjectorForTarget(targetID string) FaultInjector {
	switch strings.TrimSpace(strings.ToLower(targetID)) {
	case "docker-compose", "magento-compose":
		return ComposeFaultInjector{}
	default:
		return NoopFaultInjector{}
	}
}

// ComposeFaultInjector advertises compose-level fault kinds. Inject is not yet
// wired to toxiproxy/docker pause; callers get ErrFaultNotImplemented until the
// first chaos lab lands the backend.
type ComposeFaultInjector struct{}

// Capabilities lists compose-oriented fault kinds.
func (ComposeFaultInjector) Capabilities() []FaultKind {
	return []FaultKind{
		FaultKindLatency,
		FaultKindPartition,
		FaultKindPause,
		FaultKindServiceError,
	}
}

// Inject returns ErrFaultNotImplemented for advertised kinds until wired.
func (ComposeFaultInjector) Inject(_ context.Context, fault Fault) (func() error, error) {
	kind := normaliseFaultKind(fault.Kind)
	if !Supports(ComposeFaultInjector{}, kind) {
		return nil, fmt.Errorf("%w: %s", ErrFaultUnsupported, kind)
	}
	return nil, fmt.Errorf(
		"%w: kind %s (target %q); first chaos labs will implement this",
		ErrFaultNotImplemented,
		kind,
		fault.Target,
	)
}

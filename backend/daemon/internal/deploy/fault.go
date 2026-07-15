// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package deploy

import (
	"context"
	"errors"
	"fmt"
	"os/exec"
	"strings"
	"sync"

	"cloudsprocket/backend/daemon/internal/sysproc"
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
// call more than once. On error, revert is always nil; callers must not invoke it.
type FaultInjector interface {
	// Capabilities lists fault kinds this injector can apply.
	// Always returns a non-nil slice (empty means no chaos support).
	Capabilities() []FaultKind
	// Inject applies a fault. On success, revert undoes it; callers must call
	// it when the step ends, the lab resets, or the session closes. Revert is
	// idempotent. On error, revert is nil.
	Inject(ctx context.Context, fault Fault) (revert func() error, err error)
}

// FaultReverter restores a persisted fault after a daemon restart. Injectors
// that can leave durable runtime state must implement this interface.
type FaultReverter interface {
	Revert(ctx context.Context, fault Fault) error
}

// FaultValidator checks a concrete request without changing runtime state.
type FaultValidator interface {
	Validate(fault Fault) error
}

// ErrFaultUnsupported means the runtime cannot apply the requested fault kind.
var ErrFaultUnsupported = errors.New("fault kind is not supported on this runtime")

// ErrFaultTargetNotAllowed means a fault named a container outside the
// deployment runtime's managed target set.
var ErrFaultTargetNotAllowed = errors.New("fault target is not managed by this runtime")

// ErrFaultNotImplemented is reserved for a kind that appears in Capabilities
// but whose Inject branch is not wired yet. Callers should not see this for
// PlannedFaultKinds: those are never advertised until a backend can apply them.
var ErrFaultNotImplemented = errors.New("fault inject backend is not implemented yet")

// PlannedFaultKinds lists abstract kinds reserved for future backends
// (toxiproxy latency/partial-failure, etc.). They must not appear in
// Capabilities until Inject can apply them, so UI wiring cannot bake in a
// supported-vs-unimplemented mismatch.
func PlannedFaultKinds() []FaultKind {
	return []FaultKind{
		FaultKindLatency,
		FaultKindPartition,
		FaultKindServiceError,
	}
}

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
// Compose-based targets support container pause; others are no-op for now.
func FaultInjectorForTarget(targetID string) FaultInjector {
	switch strings.TrimSpace(strings.ToLower(targetID)) {
	case "docker-compose":
		return NewComposeFaultInjector(nil, dockerComposeLocalStackContainerName)
	default:
		return NoopFaultInjector{}
	}
}

// FaultInjectorForDeployment picks an injector from deployment runtime metadata.
func FaultInjectorForDeployment(deployment *Deployment) FaultInjector {
	if deployment == nil {
		return NoopFaultInjector{}
	}
	if !deployment.Local {
		return NoopFaultInjector{}
	}
	runtimeID := strings.TrimSpace(deployment.RuntimeID)
	if runtimeID == "" {
		// Default local AWS path is LocalStack (no compose fault backend yet).
		return NoopFaultInjector{}
	}
	return FaultInjectorForTarget(runtimeID)
}

// ContainerController pauses and unpauses named containers (docker CLI).
type ContainerController interface {
	Pause(ctx context.Context, name string) error
	Unpause(ctx context.Context, name string) error
}

type dockerContainerController struct{}

func (dockerContainerController) Pause(ctx context.Context, name string) error {
	return runDockerContainerCommand(ctx, "pause", name)
}

func (dockerContainerController) Unpause(ctx context.Context, name string) error {
	paused, exists, err := dockerContainerPaused(ctx, name)
	if err != nil {
		return err
	}
	if !exists || !paused {
		return nil
	}
	if err := runDockerContainerCommand(ctx, "unpause", name); err != nil {
		// A removal or concurrent unpause after the first inspect already leaves
		// the runtime in the desired state.
		paused, exists, inspectErr := dockerContainerPaused(ctx, name)
		if inspectErr == nil && (!exists || !paused) {
			return nil
		}
		return err
	}
	return nil
}

func dockerContainerPaused(ctx context.Context, name string) (paused, exists bool, err error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return false, false, errors.New("container name is required")
	}
	cmd := exec.CommandContext(ctx, "docker", "container", "inspect", "--format", "{{.State.Paused}}", name)
	sysproc.Hide(cmd)
	out, runErr := cmd.CombinedOutput()
	message := strings.TrimSpace(string(out))
	if runErr != nil {
		if message == "" {
			message = runErr.Error()
		}
		lower := strings.ToLower(message)
		if strings.Contains(lower, "no such object") || strings.Contains(lower, "no such container") {
			return false, false, nil
		}
		return false, false, fmt.Errorf("docker container inspect %s: %s", name, message)
	}
	switch strings.ToLower(message) {
	case "true":
		return true, true, nil
	case "false":
		return false, true, nil
	default:
		return false, true, fmt.Errorf("docker container inspect %s returned unexpected paused state %q", name, message)
	}
}

func runDockerContainerCommand(ctx context.Context, action, name string) error {
	name = strings.TrimSpace(name)
	if name == "" {
		return errors.New("container name is required")
	}
	cmd := exec.CommandContext(ctx, "docker", action, name)
	sysproc.Hide(cmd)
	out, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("docker %s %s: %s", action, name, strings.TrimSpace(string(out)))
	}
	return nil
}

// ComposeFaultInjector applies compose/docker-oriented faults. Pause is
// implemented via docker pause/unpause; other kinds await toxiproxy wiring.
type ComposeFaultInjector struct {
	containers     ContainerController
	allowedTargets map[string]struct{}
}

// NewComposeFaultInjector builds a compose injector. Pass nil containers to use
// the real docker CLI. Production callers pass the runtime-owned targets;
// omitting them keeps small unit-test fakes backwards compatible.
func NewComposeFaultInjector(containers ContainerController, allowedTargets ...string) ComposeFaultInjector {
	if containers == nil {
		containers = dockerContainerController{}
	}
	allowed := make(map[string]struct{}, len(allowedTargets))
	for _, target := range allowedTargets {
		if target = strings.TrimSpace(target); target != "" {
			allowed[target] = struct{}{}
		}
	}
	return ComposeFaultInjector{containers: containers, allowedTargets: allowed}
}

// Capabilities lists compose fault kinds that are actually injectable.
// Only pause is wired today. Planned kinds (see PlannedFaultKinds) wait for
// toxiproxy and must not be advertised until Inject can apply them.
func (ComposeFaultInjector) Capabilities() []FaultKind {
	return []FaultKind{
		FaultKindPause,
	}
}

// Validate checks support, required fields, and the production target allowlist.
func (c ComposeFaultInjector) Validate(fault Fault) error {
	kind := normaliseFaultKind(fault.Kind)
	if !Supports(c, kind) {
		return fmt.Errorf("%w: %s", ErrFaultUnsupported, kind)
	}
	if kind != FaultKindPause {
		return fmt.Errorf("%w: kind %s (target %q)", ErrFaultNotImplemented, kind, fault.Target)
	}
	target := strings.TrimSpace(fault.Target)
	if target == "" {
		return errors.New("pause fault requires a container target name")
	}
	if len(c.allowedTargets) > 0 {
		if _, ok := c.allowedTargets[target]; !ok {
			return fmt.Errorf("%w: %q", ErrFaultTargetNotAllowed, target)
		}
	}
	return nil
}

// Inject applies a supported compose fault. Pause uses docker pause on Target.
func (c ComposeFaultInjector) Inject(ctx context.Context, fault Fault) (func() error, error) {
	if err := c.Validate(fault); err != nil {
		return nil, err
	}
	kind := normaliseFaultKind(fault.Kind)
	switch kind {
	case FaultKindPause:
		target := strings.TrimSpace(fault.Target)
		if target == "" {
			return nil, errors.New("pause fault requires a container target name")
		}
		if err := c.containers.Pause(ctx, target); err != nil {
			return nil, err
		}
		var once sync.Once
		var revertErr error
		return func() error {
			once.Do(func() {
				revertErr = c.Revert(context.Background(), fault)
			})
			return revertErr
		}, nil
	default:
		return nil, fmt.Errorf("%w: kind %s (target %q)", ErrFaultNotImplemented, kind, fault.Target)
	}
}

// Revert restores a supported compose fault. Container unpause is idempotent
// for already-running and removed containers when the real Docker controller is
// used, which makes persisted restart recovery safe to replay.
func (c ComposeFaultInjector) Revert(ctx context.Context, fault Fault) error {
	if err := c.Validate(fault); err != nil {
		return err
	}
	return c.containers.Unpause(ctx, strings.TrimSpace(fault.Target))
}

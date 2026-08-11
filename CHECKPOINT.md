# Checkpoint

## Branch
`refactor/azure-bastion-f029` (from origin/dev)

## Goal
Security: event-listener 5.4.2 (RUSTSEC-2026-0221); project-status accuracy.

## Status
- Domain: `HandleBastionList`, `HandleBastionConnect`, pure helpers
  (`BastionConnectArgs`, `FormatBastionConnectCommands`, `IsWindowsVM`)
- Ports: BastionHosts, BastionHostCache, VirtualMachineLookup, InteractiveConsole, PlatformName
- Façade residual: thin wrappers + store/sysproc adapters in `azure_bastion.go`
- Tests: pure connect-arg tests in `internal/app/azure`; `go test` green
- CHANGELOG Unreleased ### Changed note added

## Next
Commit, push, open PR to dev.

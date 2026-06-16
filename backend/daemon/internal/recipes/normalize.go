package recipes

import "strings"

const (
	KindAppDeploy   = "app-deploy"
	KindServiceLab  = "service-lab"
	RuntimeLocalStack = "localstack"
	RuntimeFlociAz    = "floci-az"
	RuntimeNone       = "none"
)

// NormalizeManifest fills derived manifest fields and keeps backward compatibility
// with the legacy local.emulator / local.requiresPro shape.
func NormalizeManifest(m *Manifest) {
	if m == nil {
		return
	}
	m.Kind = strings.TrimSpace(m.Kind)
	if m.Kind == "" {
		m.Kind = inferKind(m.ID)
	}
	normalizeLocalSpec(&m.Local)
}

func inferKind(id string) string {
	id = strings.TrimSpace(id)
	if strings.HasPrefix(id, "lab-") || id == "scheduled-job-aws" {
		return KindServiceLab
	}
	return KindAppDeploy
}

func normalizeLocalSpec(local *LocalSpec) {
	if local == nil {
		return
	}
	if len(local.Runtimes) > 0 {
		return
	}
	emulator := strings.TrimSpace(local.Emulator)
	if emulator == "" {
		return
	}
	runtimeID := emulator
	if emulator == "localstack" {
		runtimeID = RuntimeLocalStack
	}
	local.Runtimes = []LocalRuntimeSpec{{
		ID:          runtimeID,
		RequiresPro: local.RequiresPro,
	}}
}

// CompatibleRuntimes returns the normalised local runtime IDs for a manifest.
func (m Manifest) CompatibleRuntimes() []string {
	copy := m
	NormalizeManifest(&copy)
	ids := make([]string, 0, len(copy.Local.Runtimes))
	for _, runtime := range copy.Local.Runtimes {
		id := strings.TrimSpace(runtime.ID)
		if id != "" {
			ids = append(ids, id)
		}
	}
	return ids
}

// RequiresLocalStackPro reports whether any declared local runtime needs Pro.
func (m Manifest) RequiresLocalStackPro() bool {
	copy := m
	NormalizeManifest(&copy)
	for _, runtime := range copy.Local.Runtimes {
		if runtime.RequiresPro {
			return true
		}
	}
	return copy.Local.RequiresPro
}
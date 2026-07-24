// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package app

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"cloudsprocket/backend/daemon/internal/deploy"
	"cloudsprocket/backend/daemon/internal/recipes"
	"cloudsprocket/backend/daemon/internal/secrets"
)

// structuredSecretMarker prefixes the sealed plaintext of a non-string secret
// value (number, bool, object, list). Its presence after Open signals that the
// remainder is the JSON-encoded original value rather than a plain string, so
// structured secrets round-trip without being silently left in plaintext. The
// NUL prefix never appears in a real string value and is only ever seen inside
// the decrypted payload.
const structuredSecretMarker = "\x00cs-json:"

// sensitiveVariableNames returns the names of a recipe's secret variables, so
// their values can be sealed at rest in the deployment record.
func sensitiveVariableNames(recipe recipes.Recipe) []string {
	var names []string
	for _, variable := range recipe.Variables {
		if variable.Sensitive || variable.Widget == "password" {
			names = append(names, variable.Name)
		}
	}
	return names
}

// loadCipher builds the at-rest cipher from the install key. Any failure is
// returned to the caller so the daemon cannot fall back to plaintext storage.
func loadCipher(keyPath string) (*secrets.Cipher, error) {
	if strings.TrimSpace(keyPath) == "" {
		return nil, errors.New("secret key path is required")
	}
	key, err := secrets.LoadOrCreateKey(keyPath)
	if err != nil {
		return nil, err
	}
	cipher, err := secrets.NewCipher(key)
	if err != nil {
		return nil, err
	}
	return cipher, nil
}

// sealForStore returns a copy of the deployment with sensitive variable values
// and sensitive output values sealed, leaving the in-memory deployment (used by
// the running operation) in plaintext. A nil cipher returns the input unchanged.
func (s *Service) sealForStore(deployment *deploy.Deployment) (*deploy.Deployment, error) {
	if deployment == nil {
		return nil, nil
	}
	if s.cipher == nil {
		return nil, errors.New("secret storage is unavailable")
	}
	clone := *deployment

	if len(deployment.Variables) > 0 {
		variables := make(map[string]any, len(deployment.Variables))
		for key, value := range deployment.Variables {
			variables[key] = value
		}
		for _, name := range deployment.SensitiveVars {
			value, err := s.sealValue(variables[name])
			if err != nil {
				return nil, fmt.Errorf("seal sensitive variable %q: %w", name, err)
			}
			variables[name] = value
		}
		clone.Variables = variables
	}

	if len(deployment.Outputs) > 0 {
		outputs := make([]deploy.Output, len(deployment.Outputs))
		copy(outputs, deployment.Outputs)
		for index := range outputs {
			if outputs[index].Sensitive {
				value, err := s.sealValue(outputs[index].Value)
				if err != nil {
					return nil, fmt.Errorf("seal sensitive output %q: %w", outputs[index].Name, err)
				}
				outputs[index].Value = value
			}
		}
		clone.Outputs = outputs
	}

	// Seal sensitive values inside historical revisions (B2). Revisions use the
	// deployment's SensitiveVars list at snapshot time.
	if len(deployment.Revisions) > 0 {
		revisions := make([]deploy.DeploymentRevision, len(deployment.Revisions))
		copy(revisions, deployment.Revisions)
		for i := range revisions {
			if len(revisions[i].Variables) > 0 {
				vars := make(map[string]any, len(revisions[i].Variables))
				for k, v := range revisions[i].Variables {
					vars[k] = v
				}
				for _, name := range deployment.SensitiveVars {
					if _, ok := vars[name]; ok {
						value, err := s.sealValue(vars[name])
						if err != nil {
							return nil, fmt.Errorf("seal revision %d variable %q: %w", i, name, err)
						}
						vars[name] = value
					}
				}
				revisions[i].Variables = vars
			}
		}
		clone.Revisions = revisions
	}

	return &clone, nil
}

// openFromStore unseals sensitive variable and output values in place after a
// deployment is loaded from the store. Legacy plaintext sensitive values are
// re-sealed in memory via Cipher.Open (which increments ResealCount and logs).
// A nil cipher is a no-op.
//
// Persistence of the sealed form is deferred to the next intentional
// saveDeployment (plan/apply/stop/etc.). Read-time write-back was removed so a
// list/get cannot race lifecycle jobs or rewrite store timestamps.
// storedPayloadJSON and storedUpdatedAt are retained for call-site compatibility.
func (s *Service) openFromStore(ctx context.Context, deployment *deploy.Deployment, storedPayloadJSON, storedUpdatedAt string) {
	_ = ctx
	_ = storedPayloadJSON
	_ = storedUpdatedAt
	if s.cipher == nil || deployment == nil {
		return
	}
	for _, name := range deployment.SensitiveVars {
		if value, ok := deployment.Variables[name]; ok {
			deployment.Variables[name] = s.openValue(value)
		}
	}
	for index := range deployment.Outputs {
		if deployment.Outputs[index].Sensitive {
			deployment.Outputs[index].Value = s.openValue(deployment.Outputs[index].Value)
		}
	}
	for i := range deployment.Revisions {
		for _, name := range deployment.SensitiveVars {
			if value, ok := deployment.Revisions[i].Variables[name]; ok {
				deployment.Revisions[i].Variables[name] = s.openValue(value)
			}
		}
	}
}

// hasLegacyPlaintextSecrets reports whether any sensitive field is stored as
// non-empty plaintext (missing the enc:v1: prefix) or as a non-string value
// that still needs structured sealing.
func (s *Service) hasLegacyPlaintextSecrets(deployment *deploy.Deployment) bool {
	if deployment == nil {
		return false
	}
	for _, name := range deployment.SensitiveVars {
		if value, ok := deployment.Variables[name]; ok && isLegacyPlaintextSecret(value) {
			return true
		}
	}
	for _, output := range deployment.Outputs {
		if output.Sensitive && isLegacyPlaintextSecret(output.Value) {
			return true
		}
	}
	for _, revision := range deployment.Revisions {
		for _, name := range deployment.SensitiveVars {
			if value, ok := revision.Variables[name]; ok && isLegacyPlaintextSecret(value) {
				return true
			}
		}
	}
	return false
}

func isLegacyPlaintextSecret(value any) bool {
	if value == nil {
		return false
	}
	text, ok := value.(string)
	if !ok {
		// Non-string sensitive values must be JSON-encoded behind the marker
		// and sealed; anything else at rest is legacy plaintext.
		return true
	}
	return text != "" && !secrets.IsSealed(text)
}

func (s *Service) sealValue(value any) (any, error) {
	if value == nil {
		return value, nil
	}
	if s.cipher == nil {
		return nil, errors.New("secret storage is unavailable")
	}
	// Strings seal directly. Structured values (number, bool, object, list) are
	// JSON-encoded behind a marker first, so they are never left in plaintext.
	if text, ok := value.(string); ok {
		if text == "" || secrets.IsSealed(text) {
			return value, nil
		}
		sealed, err := s.cipher.Seal(text)
		if err != nil {
			return nil, err
		}
		return sealed, nil
	}
	data, err := json.Marshal(value)
	if err != nil {
		return nil, err
	}
	sealed, err := s.cipher.Seal(structuredSecretMarker + string(data))
	if err != nil {
		return nil, err
	}
	return sealed, nil
}

func (s *Service) openValue(value any) any {
	text, ok := value.(string)
	if !ok {
		return value
	}
	if text == "" {
		return value
	}
	// Open decrypts enc:v1: tokens and re-seals legacy plaintext (counted and
	// logged on the cipher) so deployments are not left readable forever.
	plain, err := s.cipher.Open(text)
	if err != nil {
		return value
	}
	if encoded, found := strings.CutPrefix(plain, structuredSecretMarker); found {
		var decoded any
		if err := json.Unmarshal([]byte(encoded), &decoded); err != nil {
			return plain
		}
		return decoded
	}
	return plain
}

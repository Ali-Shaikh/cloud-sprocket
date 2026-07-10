// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package app

import (
	"encoding/json"
	"log"
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

// loadCipher builds the at-rest cipher from the install key, returning nil (with
// a logged warning) when no key can be loaded so the daemon still runs.
func loadCipher(keyPath string) *secrets.Cipher {
	if keyPath == "" {
		return nil
	}
	key, err := secrets.LoadOrCreateKey(keyPath)
	if err != nil {
		log.Printf("secrets: could not load encryption key, sensitive values will be stored unsealed: %v", err)
		return nil
	}
	cipher, err := secrets.NewCipher(key)
	if err != nil {
		log.Printf("secrets: could not initialise cipher: %v", err)
		return nil
	}
	return cipher
}

// sealForStore returns a copy of the deployment with sensitive variable values
// and sensitive output values sealed, leaving the in-memory deployment (used by
// the running operation) in plaintext. A nil cipher returns the input unchanged.
func (s *Service) sealForStore(deployment *deploy.Deployment) *deploy.Deployment {
	if s.cipher == nil || deployment == nil {
		return deployment
	}
	clone := *deployment

	if len(deployment.Variables) > 0 {
		variables := make(map[string]any, len(deployment.Variables))
		for key, value := range deployment.Variables {
			variables[key] = value
		}
		for _, name := range deployment.SensitiveVars {
			variables[name] = s.sealValue(variables[name])
		}
		clone.Variables = variables
	}

	if len(deployment.Outputs) > 0 {
		outputs := make([]deploy.Output, len(deployment.Outputs))
		copy(outputs, deployment.Outputs)
		for index := range outputs {
			if outputs[index].Sensitive {
				outputs[index].Value = s.sealValue(outputs[index].Value)
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
						vars[name] = s.sealValue(vars[name])
					}
				}
				revisions[i].Variables = vars
			}
		}
		clone.Revisions = revisions
	}

	return &clone
}

// openFromStore unseals sensitive variable and output values in place after a
// deployment is loaded from the store. A nil cipher is a no-op.
func (s *Service) openFromStore(deployment *deploy.Deployment) {
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

func (s *Service) sealValue(value any) any {
	if value == nil {
		return value
	}
	// Strings seal directly. Structured values (number, bool, object, list) are
	// JSON-encoded behind a marker first, so they are never left in plaintext.
	if text, ok := value.(string); ok {
		if text == "" || secrets.IsSealed(text) {
			return value
		}
		sealed, err := s.cipher.Seal(text)
		if err != nil {
			return value
		}
		return sealed
	}
	data, err := json.Marshal(value)
	if err != nil {
		return value
	}
	sealed, err := s.cipher.Seal(structuredSecretMarker + string(data))
	if err != nil {
		return value
	}
	return sealed
}

func (s *Service) openValue(value any) any {
	text, ok := value.(string)
	if !ok || !secrets.IsSealed(text) {
		return value
	}
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

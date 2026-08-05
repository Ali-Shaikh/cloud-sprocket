// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package gcpadapter

import (
	"context"
	"encoding/json"
	"fmt"
	"sort"
	"strings"

	"cloudsprocket/backend/daemon/internal/models"
)

// ListFunctions returns Cloud Functions (1st and 2nd gen) for the profile project
// via `gcloud functions list --format=json` and `gcloud functions list --gen2 --format=json`.
func (i *Inventory) ListFunctions(
	ctx context.Context,
	profile models.ProfileSummary,
) ([]models.GcpCloudFunction, error) {
	gen1, err1 := i.listFunctionsGeneration(ctx, profile, false)
	gen2, err2 := i.listFunctionsGeneration(ctx, profile, true)
	// Prefer partial success when one generation fails (permissions or API not enabled).
	if err1 != nil && err2 != nil {
		return nil, err1
	}
	merged := make([]models.GcpCloudFunction, 0, len(gen1)+len(gen2))
	seen := make(map[string]struct{}, len(gen1)+len(gen2))
	for _, fn := range append(gen1, gen2...) {
		key := strings.ToLower(fn.Region + "/" + fn.Name)
		if _, exists := seen[key]; exists {
			continue
		}
		seen[key] = struct{}{}
		merged = append(merged, fn)
	}
	sort.Slice(merged, func(left int, right int) bool {
		return strings.ToLower(merged[left].Name) < strings.ToLower(merged[right].Name)
	})
	if err1 != nil {
		return merged, err1
	}
	if err2 != nil {
		return merged, err2
	}
	return merged, nil
}

func (i *Inventory) listFunctionsGeneration(
	ctx context.Context,
	profile models.ProfileSummary,
	gen2 bool,
) ([]models.GcpCloudFunction, error) {
	args := []string{
		"functions", "list",
		"--format=json",
	}
	if gen2 {
		args = append(args, "--gen2")
	}
	if project := projectFromProfile(profile); project != "" {
		args = append(args, "--project", project)
	}
	payload, err := i.run(ctx, profile, args...)
	if err != nil {
		return nil, err
	}
	generation := "1st gen"
	if gen2 {
		generation = "2nd gen"
	}
	return decodeCloudFunctions(payload, generation)
}

func decodeCloudFunctions(payload []byte, generation string) ([]models.GcpCloudFunction, error) {
	trimmed := strings.TrimSpace(string(payload))
	if trimmed == "" || trimmed == "null" || trimmed == "[]" {
		return []models.GcpCloudFunction{}, nil
	}
	// gcloud may emit either an array or a single object depending on result count.
	var decoded []functionJSON
	if err := json.Unmarshal(payload, &decoded); err != nil {
		var single functionJSON
		if singleErr := json.Unmarshal(payload, &single); singleErr != nil {
			return nil, fmt.Errorf("decode gcloud functions: %w", err)
		}
		if name := functionShortName(single); name != "" {
			return []models.GcpCloudFunction{mapFunctionJSON(single, generation)}, nil
		}
		return []models.GcpCloudFunction{}, nil
	}
	functions := make([]models.GcpCloudFunction, 0, len(decoded))
	for _, item := range decoded {
		if functionShortName(item) == "" {
			continue
		}
		functions = append(functions, mapFunctionJSON(item, generation))
	}
	return functions, nil
}

// functionJSON covers both 1st-gen Cloud Functions API and 2nd-gen Cloud Functions shapes.
type functionJSON struct {
	Name         string `json:"name"`
	Status       string `json:"status"`
	State        string `json:"state"`
	Runtime      string `json:"runtime"`
	EntryPoint   string `json:"entryPoint"`
	UpdateTime   string `json:"updateTime"`
	Environment  string `json:"environment"`
	HTTPSTrigger *struct {
		URL string `json:"url"`
	} `json:"httpsTrigger"`
	// EventTrigger covers gen1 (resource) and gen2 (triggerRegion) event shapes.
	EventTrigger *struct {
		EventType     string `json:"eventType"`
		Resource      string `json:"resource"`
		TriggerRegion string `json:"triggerRegion"`
	} `json:"eventTrigger"`
	BuildConfig *struct {
		Runtime    string `json:"runtime"`
		EntryPoint string `json:"entryPoint"`
	} `json:"buildConfig"`
	ServiceConfig *struct {
		URI string `json:"uri"`
	} `json:"serviceConfig"`
}

func mapFunctionJSON(item functionJSON, generation string) models.GcpCloudFunction {
	name := functionShortName(item)
	region := functionRegion(item.Name)
	runtime := firstNonEmpty(item.Runtime, "")
	if item.BuildConfig != nil {
		runtime = firstNonEmpty(item.BuildConfig.Runtime, runtime)
	}
	status := firstNonEmpty(item.Status, item.State)
	url := ""
	if item.HTTPSTrigger != nil {
		url = strings.TrimSpace(item.HTTPSTrigger.URL)
	}
	if item.ServiceConfig != nil {
		url = firstNonEmpty(item.ServiceConfig.URI, url)
	}
	trigger := ""
	switch {
	case item.EventTrigger != nil && strings.TrimSpace(item.EventTrigger.EventType) != "":
		trigger = strings.TrimSpace(item.EventTrigger.EventType)
	case url != "" || item.HTTPSTrigger != nil || (item.ServiceConfig != nil && strings.TrimSpace(item.ServiceConfig.URI) != ""):
		trigger = "HTTPS"
	}
	// Honour environment field when gcloud tags generation explicitly.
	env := strings.ToUpper(strings.TrimSpace(item.Environment))
	switch {
	case strings.Contains(env, "GEN_2") || strings.Contains(env, "2ND"):
		generation = "2nd gen"
	case strings.Contains(env, "GEN_1") || strings.Contains(env, "1ST"):
		generation = "1st gen"
	}
	entry := models.GcpCloudFunction{
		Name:       name,
		Region:     region,
		Runtime:    runtime,
		Status:     status,
		Generation: generation,
		Trigger:    trigger,
		URL:        url,
		UpdatedAt:  strings.TrimSpace(item.UpdateTime),
	}
	parts := make([]string, 0, 4)
	if entry.Region != "" {
		parts = append(parts, entry.Region)
	}
	if entry.Runtime != "" {
		parts = append(parts, entry.Runtime)
	}
	if entry.Generation != "" {
		parts = append(parts, entry.Generation)
	}
	if entry.Status != "" {
		parts = append(parts, entry.Status)
	}
	entry.Summary = strings.Join(parts, " · ")
	return entry
}

func functionShortName(item functionJSON) string {
	raw := strings.TrimSpace(item.Name)
	if raw == "" {
		return ""
	}
	// Full resource name: projects/{p}/locations/{r}/functions/{name}
	if strings.Contains(raw, "/") {
		return resourceBasename(raw)
	}
	return raw
}

func functionRegion(resourceName string) string {
	// projects/{project}/locations/{region}/functions/{name}
	parts := strings.Split(strings.TrimSpace(resourceName), "/")
	for index := 0; index+1 < len(parts); index++ {
		if strings.EqualFold(parts[index], "locations") {
			return parts[index+1]
		}
	}
	return ""
}

// CallFunction triggers a Cloud Function via `gcloud functions call`.
// generation should be "1st gen" or "2nd gen" when known so --gen2 can be set.
// data is a JSON string passed as --data (defaults to {}).
func (i *Inventory) CallFunction(
	ctx context.Context,
	profile models.ProfileSummary,
	name string,
	region string,
	generation string,
	data string,
) (models.GcpCloudFunctionInvokeResult, error) {
	name = strings.TrimSpace(name)
	region = strings.TrimSpace(region)
	if name == "" {
		return models.GcpCloudFunctionInvokeResult{}, fmt.Errorf("function name is required")
	}
	payload := strings.TrimSpace(data)
	if payload == "" {
		payload = "{}"
	}
	args := []string{
		"functions", "call",
		name,
		"--data", payload,
	}
	if region != "" {
		args = append(args, "--region", region)
	}
	if isGen2Generation(generation) {
		args = append(args, "--gen2")
	}
	if project := projectFromProfile(profile); project != "" {
		args = append(args, "--project", project)
	}
	out, err := i.run(ctx, profile, args...)
	if err != nil {
		return models.GcpCloudFunctionInvokeResult{}, err
	}
	return models.GcpCloudFunctionInvokeResult{
		Name:       name,
		Region:     region,
		Generation: strings.TrimSpace(generation),
		Body:       strings.TrimSpace(string(out)),
	}, nil
}

func isGen2Generation(generation string) bool {
	normalised := strings.ToLower(strings.TrimSpace(generation))
	return strings.Contains(normalised, "2nd") ||
		strings.Contains(normalised, "gen2") ||
		strings.Contains(normalised, "gen_2") ||
		normalised == "2"
}

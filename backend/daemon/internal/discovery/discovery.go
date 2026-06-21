// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package discovery

import (
	"bufio"
	"bytes"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"cloudsprocket/backend/daemon/internal/config"
	"cloudsprocket/backend/daemon/internal/models"
)

var (
	sensitiveFieldNames = map[string]struct{}{
		"aws_access_key_id":     {},
		"aws_secret_access_key": {},
		"aws_session_token":     {},
		"access_key":            {},
		"secret_key":            {},
		"secret_access_key":     {},
		"client_secret":         {},
		"refresh_token":         {},
		"access_token":          {},
		"id_token":              {},
		"password":              {},
	}
	sensitiveMarkers = []string{"secret", "token", "password"}
)

type LookPathFunc func(string) (string, error)

type Service struct {
	Settings config.Settings
	LookPath LookPathFunc
}

type Snapshot struct {
	Providers []models.ProviderSummary
	Profiles  []models.ProfileSummary
}

type rawProfile struct {
	ProviderID  string
	ProfileID   string
	DisplayName string
	Summary     string
	SourcePaths []string
	Attributes  []models.DetailField
}

type providerProbe struct {
	label       string
	state       models.ProviderState
	summary     string
	commandPath string
	locations   []string
}

func New(settings config.Settings, lookPath LookPathFunc) *Service {
	return &Service{
		Settings: settings,
		LookPath: lookPath,
	}
}

func (s *Service) Discover() (Snapshot, error) {
	lookPath := s.LookPath
	if lookPath == nil {
		lookPath = func(string) (string, error) { return "", errors.New("command lookup unavailable") }
	}

	rawProfiles := []rawProfile{}
	rawProfiles = append(rawProfiles, s.discoverAWS()...)
	rawProfiles = append(rawProfiles, s.discoverAzure()...)
	rawProfiles = append(rawProfiles, s.discoverGCP()...)

	probes := map[string]providerProbe{
		"aws":   s.probeProvider("AWS", "aws", []string{s.Settings.AWSConfigPath, s.Settings.AWSCredentialsPath}, lookPath),
		"azure": s.probeProvider("Azure", "az", []string{s.Settings.AzureProfilePath()}, lookPath),
		"gcp":   s.probeProvider("GCP", "gcloud", []string{s.Settings.GCloudConfigDir()}, lookPath),
	}

	profiles := make([]models.ProfileSummary, 0, len(rawProfiles))
	counts := map[string]int{}
	for _, profile := range rawProfiles {
		counts[profile.ProviderID]++
		probe := probes[profile.ProviderID]
		profiles = append(profiles, models.ProfileSummary{
			ProviderID:  profile.ProviderID,
			ProfileID:   profile.ProfileID,
			DisplayName: profile.DisplayName,
			Summary:     profile.Summary,
			SourcePaths: profile.SourcePaths,
			Attributes:  profile.Attributes,
			AuthMethods: buildAuthMethods(profile.ProviderID, profile.Attributes, probe.commandPath != ""),
		})
	}

	sort.Slice(profiles, func(left int, right int) bool {
		if profiles[left].ProviderID != profiles[right].ProviderID {
			return profiles[left].ProviderID < profiles[right].ProviderID
		}
		if strings.ToLower(profiles[left].DisplayName) != strings.ToLower(profiles[right].DisplayName) {
			return strings.ToLower(profiles[left].DisplayName) < strings.ToLower(profiles[right].DisplayName)
		}
		return profiles[left].ProfileID < profiles[right].ProfileID
	})

	providers := []models.ProviderSummary{
		{
			ProviderID:   "aws",
			Label:        probes["aws"].label,
			State:        probes["aws"].state,
			Summary:      probes["aws"].summary,
			ProfileCount: counts["aws"],
			CommandPath:  probes["aws"].commandPath,
			Locations:    probes["aws"].locations,
		},
		{
			ProviderID:   "azure",
			Label:        probes["azure"].label,
			State:        probes["azure"].state,
			Summary:      probes["azure"].summary,
			ProfileCount: counts["azure"],
			CommandPath:  probes["azure"].commandPath,
			Locations:    probes["azure"].locations,
		},
		{
			ProviderID:   "gcp",
			Label:        probes["gcp"].label,
			State:        probes["gcp"].state,
			Summary:      probes["gcp"].summary,
			ProfileCount: counts["gcp"],
			CommandPath:  probes["gcp"].commandPath,
			Locations:    probes["gcp"].locations,
		},
	}

	return Snapshot{Providers: providers, Profiles: profiles}, nil
}

func (s *Service) probeProvider(label string, command string, candidates []string, lookPath LookPathFunc) providerProbe {
	locations := []string{}
	for _, candidate := range candidates {
		if candidate == "" {
			continue
		}
		if _, err := os.Stat(candidate); err == nil {
			locations = append(locations, candidate)
		}
	}

	commandPath, _ := lookPath(command)
	state := models.ProviderStateMissing
	summary := "No CLI or local profile data was detected."
	if len(locations) > 0 {
		state = models.ProviderStateConfigured
		summary = "Local credentials or profile data detected."
	} else if commandPath != "" {
		state = models.ProviderStateToolingOnly
		summary = command + " is installed, but no local profile data was found."
	}

	return providerProbe{
		label:       label,
		state:       state,
		summary:     summary,
		commandPath: commandPath,
		locations:   locations,
	}
}

func (s *Service) discoverAWS() []rawProfile {
	detailsByName := map[string]map[string]string{}
	sourcesByName := map[string]map[string]struct{}{}

	for _, candidate := range []struct {
		path       string
		trimPrefix bool
	}{
		{path: s.Settings.AWSConfigPath, trimPrefix: true},
		{path: s.Settings.AWSCredentialsPath, trimPrefix: false},
	} {
		if candidate.path == "" {
			continue
		}
		sections, err := parseINIFile(candidate.path)
		if err != nil {
			continue
		}
		for sectionName, entries := range sections {
			profileName := sectionName
			if candidate.trimPrefix && strings.HasPrefix(sectionName, "profile ") {
				profileName = strings.TrimSpace(strings.TrimPrefix(sectionName, "profile "))
			}
			if _, ok := detailsByName[profileName]; !ok {
				detailsByName[profileName] = map[string]string{}
			}
			for key, value := range entries {
				detailsByName[profileName][key] = value
			}
			if _, ok := sourcesByName[profileName]; !ok {
				sourcesByName[profileName] = map[string]struct{}{}
			}
			sourcesByName[profileName][candidate.path] = struct{}{}
		}
	}

	profiles := make([]rawProfile, 0, len(detailsByName))
	for profileName, values := range detailsByName {
		sourcePaths := mapKeys(sourcesByName[profileName])
		sort.Strings(sourcePaths)
		attributes := make([]models.DetailField, 0, len(values))
		for _, key := range sortedKeys(values) {
			attributes = append(attributes, models.DetailField{
				Label:     humaniseLabel(key),
				Value:     values[key],
				Sensitive: isSensitiveField(key),
			})
		}
		profiles = append(profiles, rawProfile{
			ProviderID:  "aws",
			ProfileID:   profileName,
			DisplayName: profileName,
			Summary:     joinNonEmpty(values["region"], values["sso_account_id"], values["role_arn"]),
			SourcePaths: sourcePaths,
			Attributes:  attributes,
		})
	}

	return profiles
}

func (s *Service) discoverAzure() []rawProfile {
	path := s.Settings.AzureProfilePath()
	payload, err := os.ReadFile(path)
	if err != nil {
		return nil
	}
	payload = bytes.TrimPrefix(payload, []byte{0xEF, 0xBB, 0xBF})

	var decoded struct {
		Subscriptions []map[string]any `json:"subscriptions"`
	}
	if err := json.Unmarshal(payload, &decoded); err != nil {
		return nil
	}

	profiles := []rawProfile{}
	for _, subscription := range decoded.Subscriptions {
		profileID := stringFromAny(subscription["id"])
		displayName := firstNonEmptyValue(stringFromAny(subscription["name"]), profileID)
		tenantID := stringFromAny(subscription["tenantId"])
		userName := ""
		if user, ok := subscription["user"].(map[string]any); ok {
			userName = stringFromAny(user["name"])
		}
		profiles = append(profiles, rawProfile{
			ProviderID:  "azure",
			ProfileID:   profileID,
			DisplayName: displayName,
			Summary:     joinNonEmpty(tenantID, userName),
			SourcePaths: []string{path},
			Attributes: []models.DetailField{
				{Label: "Subscription ID", Value: profileID},
				{Label: "Tenant ID", Value: tenantID},
				{Label: "User Name", Value: userName},
			},
		})
	}
	return profiles
}

func (s *Service) discoverGCP() []rawProfile {
	configDir := s.Settings.GCloudConfigDir()
	entries, err := filepath.Glob(filepath.Join(configDir, "config_*"))
	if err != nil {
		return nil
	}

	profiles := []rawProfile{}
	for _, path := range entries {
		sections, err := parseINIFile(path)
		if err != nil {
			continue
		}
		core := sections["core"]
		account := core["account"]
		project := core["project"]
		profileName := strings.TrimPrefix(filepath.Base(path), "config_")
		if profileName == "" {
			profileName = "default"
		}
		displayName := firstNonEmptyValue(project, profileName)
		profiles = append(profiles, rawProfile{
			ProviderID:  "gcp",
			ProfileID:   profileName,
			DisplayName: displayName,
			Summary:     joinNonEmpty(account, project),
			SourcePaths: []string{path},
			Attributes: []models.DetailField{
				{Label: "Configuration", Value: profileName},
				{Label: "Account", Value: account},
				{Label: "Project", Value: project},
			},
		})
	}

	return profiles
}

func buildAuthMethods(providerID string, fields []models.DetailField, cliAvailable bool) []models.AuthMethodStatus {
	if providerID == "aws" {
		ssoAvailable := false
		for _, field := range fields {
			normalised := strings.ToLower(strings.ReplaceAll(field.Label, " ", "_"))
			switch normalised {
			case "sso_start_url", "sso_session", "sso_account_id", "sso_role_name":
				ssoAvailable = true
			}
		}
		return []models.AuthMethodStatus{
			{Method: models.AuthMethodCLI, Label: "CLI", Summary: cliSummary(providerID, cliAvailable), Available: cliAvailable},
			{Method: models.AuthMethodSSO, Label: "SSO", Summary: firstNonEmptyValue(boolSummary(ssoAvailable, "AWS SSO metadata detected.", "No AWS SSO metadata detected."), "AWS SSO metadata unavailable."), Available: ssoAvailable},
			{Method: models.AuthMethodLocalFiles, Label: "Local Files", Summary: "Profile configuration is visible as read-only data.", Available: true},
		}
	}
	return []models.AuthMethodStatus{
		{Method: models.AuthMethodCLI, Label: "CLI", Summary: cliSummary(providerID, cliAvailable), Available: cliAvailable},
		{Method: models.AuthMethodSSO, Label: "SSO", Summary: "Provider-specific SSO remains out of scope for the first rewrite milestone.", Available: false},
		{Method: models.AuthMethodLocalFiles, Label: "Local Files", Summary: "Profile configuration is visible as read-only data.", Available: true},
	}
}

func cliSummary(providerID string, cliAvailable bool) string {
	if cliAvailable {
		return strings.ToUpper(providerID) + " CLI detected."
	}
	return strings.ToUpper(providerID) + " CLI is not currently available."
}

func parseINIFile(path string) (map[string]map[string]string, error) {
	file, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer file.Close()

	sections := map[string]map[string]string{}
	currentSection := ""
	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") || strings.HasPrefix(line, ";") {
			continue
		}
		if strings.HasPrefix(line, "[") && strings.HasSuffix(line, "]") {
			currentSection = strings.TrimSpace(strings.TrimSuffix(strings.TrimPrefix(line, "["), "]"))
			if _, ok := sections[currentSection]; !ok {
				sections[currentSection] = map[string]string{}
			}
			continue
		}
		if currentSection == "" {
			continue
		}
		separator := strings.IndexAny(line, "=:")
		if separator < 0 {
			continue
		}
		key := strings.TrimSpace(line[:separator])
		value := strings.TrimSpace(line[separator+1:])
		sections[currentSection][key] = value
	}
	return sections, scanner.Err()
}

func isSensitiveField(label string) bool {
	normalised := strings.ToLower(label)
	if _, ok := sensitiveFieldNames[normalised]; ok {
		return true
	}
	for _, marker := range sensitiveMarkers {
		if strings.Contains(normalised, marker) {
			return true
		}
	}
	return false
}

func humaniseLabel(label string) string {
	parts := strings.Fields(strings.NewReplacer("_", " ", "-", " ").Replace(label))
	for index, part := range parts {
		if part == "" {
			continue
		}
		parts[index] = strings.ToUpper(part[:1]) + strings.ToLower(part[1:])
	}
	return strings.Join(parts, " ")
}

func joinNonEmpty(values ...string) string {
	filtered := []string{}
	for _, value := range values {
		if trimmed := strings.TrimSpace(value); trimmed != "" {
			filtered = append(filtered, trimmed)
		}
	}
	return strings.Join(filtered, ", ")
}

func mapKeys(values map[string]struct{}) []string {
	keys := make([]string, 0, len(values))
	for key := range values {
		keys = append(keys, key)
	}
	return keys
}

func sortedKeys(values map[string]string) []string {
	keys := make([]string, 0, len(values))
	for key := range values {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	return keys
}

func stringFromAny(value any) string {
	if stringValue, ok := value.(string); ok {
		return stringValue
	}
	return ""
}

func firstNonEmptyValue(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return value
		}
	}
	return ""
}

func boolSummary(value bool, whenTrue string, whenFalse string) string {
	if value {
		return whenTrue
	}
	return whenFalse
}

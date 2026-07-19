// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package deploy

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"cloudsprocket/backend/daemon/internal/config"
	"cloudsprocket/backend/daemon/internal/flociazcompat"
	"cloudsprocket/backend/daemon/internal/recipes"
	"cloudsprocket/backend/daemon/internal/tofu"
)

func TestWriteTfvars(t *testing.T) {
	dir := t.TempDir()
	vars := map[string]any{"app_name": "demo", "lambda_memory_mb": 512, "enable": true}
	if err := writeTfvars(dir, vars); err != nil {
		t.Fatalf("writeTfvars: %v", err)
	}
	data, err := os.ReadFile(filepath.Join(dir, tfvarsFile))
	if err != nil {
		t.Fatalf("read tfvars: %v", err)
	}
	var back map[string]any
	if err := json.Unmarshal(data, &back); err != nil {
		t.Fatalf("unmarshal tfvars: %v", err)
	}
	if back["app_name"] != "demo" {
		t.Fatalf("tfvars = %v", back)
	}
}

func TestLocalStackOverrideContent(t *testing.T) {
	out := localStackOverride("http://localhost:4566")
	for _, want := range []string{
		`provider "aws"`,
		`s3_use_path_style           = true`,
		`skip_credentials_validation = true`,
		"endpoints {",
		`dynamodb        = "http://localhost:4566"`,
		`lambda          = "http://localhost:4566"`,
		`apigatewayv2    = "http://localhost:4566"`,
		`elasticache     = "http://localhost:4566"`,
	} {
		if !strings.Contains(out, want) {
			t.Fatalf("override missing %q in:\n%s", want, out)
		}
	}
}

func TestParsePlan(t *testing.T) {
	raw := []byte(`{
		"resource_changes": [
			{"address":"aws_s3_bucket.frontend","type":"aws_s3_bucket","name":"frontend","change":{"actions":["create"]}},
			{"address":"aws_dynamodb_table.data","type":"aws_dynamodb_table","name":"data","change":{"actions":["update"]}},
			{"address":"aws_iam_role.lambda","type":"aws_iam_role","name":"lambda","change":{"actions":["delete"]}},
			{"address":"aws_lambda_function.api","type":"aws_lambda_function","name":"api","change":{"actions":["create","delete"]}},
			{"address":"data.archive_file.api","type":"archive_file","name":"api","change":{"actions":["read"]}},
			{"address":"aws_apigatewayv2_api.http","type":"aws_apigatewayv2_api","name":"http","change":{"actions":["no-op"]}}
		]
	}`)
	summary, err := parsePlan(raw)
	if err != nil {
		t.Fatalf("parsePlan: %v", err)
	}
	if summary.Add != 1 || summary.Change != 2 || summary.Destroy != 1 {
		t.Fatalf("summary counts = %+v", summary)
	}
	// no-op and read are excluded from the change list.
	if len(summary.Changes) != 4 {
		t.Fatalf("expected 4 changes, got %d (%+v)", len(summary.Changes), summary.Changes)
	}
}

func TestParseOutputs(t *testing.T) {
	raw := []byte(`{
		"api_endpoint": {"value":"http://localhost:4566/restapis/abc","sensitive":false},
		"frontend_bucket": {"value":"demo-dev-frontend","sensitive":false},
		"db_password": {"value":"s3cret","sensitive":true}
	}`)
	outputs, err := parseOutputs(raw)
	if err != nil {
		t.Fatalf("parseOutputs: %v", err)
	}
	if len(outputs) != 3 {
		t.Fatalf("expected 3 outputs, got %d", len(outputs))
	}
	if outputs[0].Name != "api_endpoint" { // sorted
		t.Fatalf("first output = %q", outputs[0].Name)
	}
	for _, o := range outputs {
		if o.Name == "db_password" && !o.Sensitive {
			t.Fatal("db_password should be sensitive")
		}
	}
}

func TestPlanRejectsAzureFunctionsOnFlociAz(t *testing.T) {
	e := NewEngine(tofu.NewRunner("tofu"), config.Settings{DeploymentsDir: t.TempDir()}, recipes.Bundled())
	deployment := &Deployment{
		ID:         "dep-func-floci",
		RecipeID:   "lab-functions-http-azure",
		ProviderID: "azure",
		Local:      true,
		RuntimeID:  "floci-az",
	}
	_, err := e.Plan(context.Background(), deployment, nil)
	if err == nil {
		t.Fatal("expected plan to reject Function App recipes on floci-az")
	}
	if !strings.Contains(err.Error(), "floci-az does not fully emulate") {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestTofuPluginCacheEnvRequiresAbsoluteConfigDir(t *testing.T) {
	if env := tofuPluginCacheEnv(config.Settings{}); len(env) != 0 {
		t.Fatalf("empty ConfigDir should skip cache env, got %v", env)
	}
	if env := tofuPluginCacheEnv(config.Settings{ConfigDir: "relative-config"}); len(env) != 0 {
		t.Fatalf("relative ConfigDir should skip cache env, got %v", env)
	}
	abs := t.TempDir()
	env := tofuPluginCacheEnv(config.Settings{ConfigDir: abs})
	if !envContainsKey(env, "TF_PLUGIN_CACHE_DIR", "plugin-cache") {
		t.Fatalf("absolute ConfigDir should set TF_PLUGIN_CACHE_DIR, got %v", env)
	}
	if !envContainsKey(env, "TF_PLUGIN_CACHE_DIR", abs) {
		t.Fatalf("cache dir should be under ConfigDir, got %v", env)
	}
}

func TestEnvLocalVsReal(t *testing.T) {
	e := NewEngine(tofu.NewRunner("tofu"), config.Settings{
		ConfigDir:          t.TempDir(),
		AWSConfigPath:      "/home/u/.aws/config",
		AWSCredentialsPath: "/home/u/.aws/credentials",
		AzureDir:           "/home/u/.azure",
	}, recipes.Bundled())

	local := e.env(&Deployment{ProviderID: "aws", Local: true})
	if !contains(local, "AWS_ACCESS_KEY_ID=test") {
		t.Fatalf("local env = %v", local)
	}
	if !envContainsKey(local, "TF_PLUGIN_CACHE_DIR", "plugin-cache") {
		t.Fatalf("local env missing TF_PLUGIN_CACHE_DIR, got %v", local)
	}
	real := e.env(&Deployment{ProviderID: "aws", ProfileID: "prod"})
	if !contains(real, "AWS_PROFILE=prod") || !contains(real, "AWS_CONFIG_FILE=/home/u/.aws/config") {
		t.Fatalf("real env = %v", real)
	}
	for _, key := range []string{"AWS_ACCESS_KEY_ID=", "AWS_SECRET_ACCESS_KEY=", "AWS_SESSION_TOKEN="} {
		if !contains(real, key) {
			t.Fatalf("expected cloud env to clear %q, got %v", key, real)
		}
	}
	azureCloud := e.env(&Deployment{ProviderID: "azure", ProfileID: "sub-001"})
	if !contains(azureCloud, "ARM_SUBSCRIPTION_ID=sub-001") || !contains(azureCloud, "ARM_USE_CLI=true") {
		t.Fatalf("azure cloud env = %v", azureCloud)
	}
	flociLocal := e.env(&Deployment{ProviderID: "azure", Local: true, RuntimeID: "floci-az"})
	for _, want := range []string{
		"ARM_SUBSCRIPTION_ID=" + flociazcompat.SubscriptionID,
		"ARM_CLIENT_ID=" + flociazcompat.ClientID,
		"ARM_TENANT_ID=" + flociazcompat.TenantID,
		"ARM_METADATA_HOSTNAME=localhost:4577",
		"ARM_USE_CLI=false",
	} {
		if !contains(flociLocal, want) {
			t.Fatalf("floci local env missing %q, got %v", want, flociLocal)
		}
	}
	if !envContainsKey(flociLocal, "SSL_CERT_FILE", flociazcompat.TrustCertFilename) {
		t.Fatalf("floci local env missing SSL_CERT_FILE with trust cert, got %v", flociLocal)
	}
}

func TestFlociAzOverrideContent(t *testing.T) {
	out := flociazcompat.ProviderOverrideHCL("localhost:4577")
	for _, want := range []string{
		`provider "azurerm"`,
		`resource_provider_registrations = "none"`,
		`use_cli                         = false`,
		`metadata_host = "localhost:4577"`,
		flociazcompat.SubscriptionID,
		flociazcompat.ClientID,
		flociazcompat.TenantID,
		flociazcompat.ClientSecret,
	} {
		if !strings.Contains(out, want) {
			t.Fatalf("override missing %q in:\n%s", want, out)
		}
	}
	if strings.Contains(out, "00000000-0000-0000-0000-000000000000") {
		t.Fatalf("override must not use all-zero Entra GUIDs:\n%s", out)
	}
}

func TestSyncWorkspaceRefreshesFlociAzOverride(t *testing.T) {
	settings := config.Settings{DeploymentsDir: t.TempDir()}
	e := NewEngine(tofu.NewRunner("tofu"), settings, recipes.Bundled())
	deployment := &Deployment{
		ID:         "dep-sync",
		RecipeID:   "lab-postgres-flexible-azure",
		ProviderID: "azure",
		Local:      true,
		RuntimeID:  "floci-az",
		Variables:  map[string]any{"app_name": "lab"},
	}
	if err := e.Prepare(deployment); err != nil {
		t.Fatalf("Prepare: %v", err)
	}
	dir := e.WorkspaceDir("dep-sync")
	overridePath := filepath.Join(dir, flociAzOverrideFile)
	if err := os.WriteFile(overridePath, []byte(`client_id = "00000000-0000-0000-0000-000000000000"`), 0o644); err != nil {
		t.Fatalf("seed stale override: %v", err)
	}
	if err := e.SyncWorkspace(deployment); err != nil {
		t.Fatalf("SyncWorkspace: %v", err)
	}
	content, err := os.ReadFile(overridePath)
	if err != nil {
		t.Fatalf("read override: %v", err)
	}
	text := string(content)
	if !strings.Contains(text, flociazcompat.ClientID) || strings.Contains(text, "00000000-0000-0000-0000-000000000000") {
		t.Fatalf("expected refreshed override, got:\n%s", text)
	}
}

func TestPrepareWritesFlociAzOverride(t *testing.T) {
	settings := config.Settings{DeploymentsDir: t.TempDir()}
	e := NewEngine(tofu.NewRunner("tofu"), settings, recipes.Bundled())
	deployment := &Deployment{
		ID:         "dep-floci",
		RecipeID:   "magento-commerce-azure",
		ProviderID: "azure",
		Local:      true,
		RuntimeID:  "floci-az",
		Variables:  map[string]any{"app_name": "demo"},
	}
	if err := e.Prepare(deployment); err != nil {
		t.Fatalf("Prepare: %v", err)
	}
	dir := e.WorkspaceDir("dep-floci")
	if _, err := os.Stat(filepath.Join(dir, flociAzOverrideFile)); err != nil {
		t.Fatalf("expected floci override in workspace: %v", err)
	}
	if _, err := os.Stat(filepath.Join(dir, overrideFile)); err == nil {
		t.Fatal("floci deployment should not write a LocalStack override file")
	}
}

func envContainsKey(env []string, key, valueFragment string) bool {
	prefix := key + "="
	for _, entry := range env {
		if strings.HasPrefix(entry, prefix) && strings.Contains(entry, valueFragment) {
			return true
		}
	}
	return false
}

func TestPrepareMaterialisesWorkspace(t *testing.T) {
	settings := config.Settings{DeploymentsDir: t.TempDir()}
	e := NewEngine(tofu.NewRunner("tofu"), settings, recipes.Bundled())
	deployment := &Deployment{
		ID:         "dep-test",
		RecipeID:   "serverless-fullstack-aws",
		ProviderID: "aws",
		Local:      true,
		Variables:  map[string]any{"app_name": "demo"},
	}
	if err := e.Prepare(deployment); err != nil {
		t.Fatalf("Prepare: %v", err)
	}
	dir := e.WorkspaceDir("dep-test")
	for _, rel := range []string{
		"main.tf",
		tfvarsFile,
		overrideFile,
		filepath.Join("sample-api", "handler.js"),
		filepath.Join("sample-site", "index.html"),
	} {
		if _, err := os.Stat(filepath.Join(dir, rel)); err != nil {
			t.Fatalf("expected %s in workspace: %v", rel, err)
		}
	}
}

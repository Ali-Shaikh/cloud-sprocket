// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package deploy

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"cloudsprocket/backend/daemon/internal/config"
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

func TestEnvLocalVsReal(t *testing.T) {
	e := NewEngine(tofu.NewRunner("tofu"), config.Settings{
		AWSConfigPath:      "/home/u/.aws/config",
		AWSCredentialsPath: "/home/u/.aws/credentials",
	}, recipes.Bundled())

	local := e.env(&Deployment{ProviderID: "aws", Local: true})
	if !contains(local, "AWS_ACCESS_KEY_ID=test") {
		t.Fatalf("local env = %v", local)
	}
	real := e.env(&Deployment{ProviderID: "aws", ProfileID: "prod"})
	if !contains(real, "AWS_PROFILE=prod") || !contains(real, "AWS_CONFIG_FILE=/home/u/.aws/config") {
		t.Fatalf("real env = %v", real)
	}
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

package recipes

import (
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestBundledListIncludesServerlessRecipe(t *testing.T) {
	manifests, err := Bundled().List()
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	if len(manifests) == 0 {
		t.Fatal("expected at least one bundled recipe")
	}
	found := false
	for _, m := range manifests {
		if m.ID == "serverless-fullstack-aws" {
			found = true
			if m.Name == "" || m.Version == "" {
				t.Fatalf("manifest missing fields: %+v", m)
			}
		}
	}
	if !found {
		t.Fatal("serverless-fullstack-aws not listed")
	}
}

func fsReadRecipeFile(recipeID string, name string) (string, error) {
	data, err := fs.ReadFile(bundledFS, filepath.ToSlash(filepath.Join("bundled", recipeID, name)))
	if err != nil {
		return "", err
	}
	return string(data), nil
}

func TestLoadServerlessRecipeIntrospection(t *testing.T) {
	recipe, err := Bundled().Load("serverless-fullstack-aws")
	if err != nil {
		t.Fatalf("Load: %v", err)
	}

	byName := map[string]Variable{}
	for _, v := range recipe.Variables {
		byName[v.Name] = v
	}

	// Variable types introspected from variables.tf.
	if got := byName["app_name"]; got.Type != "string" || got.Default != "myapp" {
		t.Fatalf("app_name = %+v", got)
	}
	if got := byName["backend_source_dir"]; got.Default != "./sample-api" {
		t.Fatalf("backend_source_dir default = %+v", got)
	}
	if got := byName["frontend_dist_dir"]; got.Default != "./sample-site" {
		t.Fatalf("frontend_dist_dir default = %+v", got)
	}
	if got := byName["lambda_memory_mb"]; got.Type != "number" || got.Widget != "number" {
		t.Fatalf("lambda_memory_mb = %+v", got)
	}
	if got := byName["enable_point_in_time_recovery"]; got.Type != "bool" || got.Widget != "switch" {
		t.Fatalf("pitr = %+v", got)
	}

	// Manifest hints merged in.
	if got := byName["environment"]; got.Widget != "select" || len(got.Options) != 3 {
		t.Fatalf("environment hint not merged: %+v", got)
	}
	if got := byName["app_name"]; got.Group != "Application" {
		t.Fatalf("app_name group = %q", got.Group)
	}
	if got := byName["tags"]; got.Widget != "textarea" {
		t.Fatalf("tags widget = %q", got.Widget)
	}

	// Outputs introspected + primary flag from the manifest.
	primary := map[string]bool{}
	for _, o := range recipe.Outputs {
		primary[o.Name] = o.Primary
	}
	if !primary["api_endpoint"] {
		t.Fatal("api_endpoint should be a primary output")
	}
	if _, ok := primary["dynamodb_table"]; !ok {
		t.Fatal("dynamodb_table output missing")
	}
}

func TestServerlessRecipeUsesCurrentLambdaRuntimeAndPublicFrontend(t *testing.T) {
	mainTF, err := fsReadRecipeFile("serverless-fullstack-aws", "main.tf")
	if err != nil {
		t.Fatalf("read serverless main.tf: %v", err)
	}
	for _, want := range []string{
		`runtime          = "nodejs22.x"`,
		`resource "aws_s3_bucket_public_access_block" "frontend"`,
		`resource "aws_s3_bucket_policy" "frontend_public_read"`,
		`s3:GetObject`,
	} {
		if !strings.Contains(mainTF, want) {
			t.Fatalf("serverless recipe missing %q", want)
		}
	}
}

func TestLoadContainerRecipe(t *testing.T) {
	recipe, err := Bundled().Load("container-fullstack-aws")
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if !recipe.Manifest.RequiresLocalStackPro() {
		t.Fatal("container recipe should be flagged requiresPro")
	}
	byName := map[string]Variable{}
	for _, v := range recipe.Variables {
		byName[v.Name] = v
	}
	if got := byName["db_password"]; !got.Sensitive && got.Widget != "password" {
		t.Fatalf("db_password should be sensitive/password: %+v", got)
	}
	if _, ok := byName["container_image"]; !ok {
		t.Fatal("container_image variable missing")
	}
	if got := byName["container_image"]; got.Default != "public.ecr.aws/docker/library/nginx:stable-alpine" {
		t.Fatalf("container_image default = %+v", got)
	}
	if got := byName["container_port"]; fmt.Sprint(got.Default) != "80" {
		t.Fatalf("container_port default = %+v", got)
	}
	if _, ok := byName["desired_count"]; !ok {
		t.Fatal("desired_count variable missing")
	}
	if got := byName["frontend_dist_dir"]; got.Default != "./sample-site" {
		t.Fatalf("frontend_dist_dir default = %+v", got)
	}

	present := map[string]bool{}
	for _, o := range recipe.Outputs {
		present[o.Name] = true
	}
	if !present["frontend_website_endpoint"] {
		t.Fatal("frontend_website_endpoint output missing")
	}
}

func TestLoadStaticSiteRecipe(t *testing.T) {
	recipe, err := Bundled().Load("static-site-aws")
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if recipe.Manifest.Local.RequiresPro {
		t.Fatal("static-site recipe should not be flagged requiresPro")
	}
	byName := map[string]Variable{}
	for _, v := range recipe.Variables {
		byName[v.Name] = v
	}
	if got := byName["app_name"]; got.Type != "string" {
		t.Fatalf("app_name = %+v", got)
	}
	if _, ok := byName["frontend_dist_dir"]; !ok {
		t.Fatal("frontend_dist_dir variable missing")
	}
	if got := byName["frontend_dist_dir"]; got.Default != "./sample-site" {
		t.Fatalf("frontend_dist_dir default = %+v", got)
	}
	if _, ok := byName["aws_region"]; !ok {
		t.Fatal("aws_region variable missing")
	}

	primary := map[string]bool{}
	present := map[string]bool{}
	for _, o := range recipe.Outputs {
		primary[o.Name] = o.Primary
		present[o.Name] = true
	}
	if !primary["website_endpoint"] {
		t.Fatal("website_endpoint should be a primary output")
	}
	if !present["bucket_name"] {
		t.Fatal("bucket_name output missing")
	}

	mainTF, err := fsReadRecipeFile("static-site-aws", "main.tf")
	if err != nil {
		t.Fatalf("read static-site main.tf: %v", err)
	}
	for _, want := range []string{
		`resource "aws_s3_bucket_public_access_block" "site"`,
		`resource "aws_s3_bucket_policy" "site_public_read"`,
		`s3:GetObject`,
		`${aws_s3_bucket.site.arn}/*`,
	} {
		if !strings.Contains(mainTF, want) {
			t.Fatalf("static-site recipe missing %q", want)
		}
	}
}

func TestLoadScheduledJobRecipe(t *testing.T) {
	recipe, err := Bundled().Load("scheduled-job-aws")
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if recipe.Manifest.Local.RequiresPro {
		t.Fatal("scheduled-job recipe should not be flagged requiresPro")
	}
	byName := map[string]Variable{}
	for _, v := range recipe.Variables {
		byName[v.Name] = v
	}
	if got := byName["schedule_expression"]; got.Type != "string" || got.Default != "rate(5 minutes)" {
		t.Fatalf("schedule_expression = %+v", got)
	}
	if got := byName["backend_source_dir"]; got.Default != "./sample-job" {
		t.Fatalf("backend_source_dir default = %+v", got)
	}
	if got := byName["lambda_memory_mb"]; got.Type != "number" || got.Widget != "number" {
		t.Fatalf("lambda_memory_mb = %+v", got)
	}
	if _, ok := byName["backend_source_dir"]; !ok {
		t.Fatal("backend_source_dir variable missing")
	}

	// Build step installing backend dependencies, mirroring the serverless recipe.
	if len(recipe.Manifest.Build) == 0 {
		t.Fatal("expected a build step")
	}
	if got := recipe.Manifest.Build[0]; got.DirVar != "backend_source_dir" || got.Requires != "package.json" {
		t.Fatalf("build step = %+v", got)
	}

	primary := map[string]bool{}
	present := map[string]bool{}
	for _, o := range recipe.Outputs {
		primary[o.Name] = o.Primary
		present[o.Name] = true
	}
	if !primary["lambda_function_name"] {
		t.Fatal("lambda_function_name should be a primary output")
	}
	if !present["schedule_rule_name"] {
		t.Fatal("schedule_rule_name output missing")
	}
}

func TestScheduledRecipeUsesCurrentLambdaRuntime(t *testing.T) {
	mainTF, err := fsReadRecipeFile("scheduled-job-aws", "main.tf")
	if err != nil {
		t.Fatalf("read scheduled-job main.tf: %v", err)
	}
	if !strings.Contains(mainTF, `runtime          = "nodejs22.x"`) {
		t.Fatal("scheduled-job recipe should use nodejs22.x")
	}
}

func TestBundledListHasBothRecipes(t *testing.T) {
	manifests, err := Bundled().List()
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	if len(manifests) < 4 {
		t.Fatalf("expected at least 4 bundled recipes, got %d", len(manifests))
	}
}

func TestMaterialiseCopiesFiles(t *testing.T) {
	dest := t.TempDir()
	if err := Bundled().Materialise("serverless-fullstack-aws", dest); err != nil {
		t.Fatalf("Materialise: %v", err)
	}
	for _, rel := range []string{
		"main.tf",
		"variables.tf",
		"outputs.tf",
		"recipe.yaml",
		filepath.Join("sample-api", "handler.js"),
		filepath.Join("sample-site", "index.html"),
	} {
		if _, err := os.Stat(filepath.Join(dest, rel)); err != nil {
			t.Fatalf("expected %s to be materialised: %v", rel, err)
		}
	}
}

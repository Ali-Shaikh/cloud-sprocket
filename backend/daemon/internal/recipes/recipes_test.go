// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package recipes

import (
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"testing/fstest"
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

func TestAzureFunctionRecipesAreCloudOnly(t *testing.T) {
	ids := []string{
		"lab-functions-http-azure",
		"azure-functions-http-azure",
		"azure-queue-function-azure",
		"azure-keyvault-function-azure",
		"azure-blob-event-function-azure",
		"lab-storage-event-function-azure",
	}
	loader := Bundled()
	for _, id := range ids {
		recipe, err := loader.Load(id)
		if err != nil {
			t.Fatalf("Load %s: %v", id, err)
		}
		if len(recipe.Manifest.Local.Runtimes) != 0 {
			t.Fatalf("%s: expected cloud-only (no local runtimes), got %+v", id, recipe.Manifest.Local.Runtimes)
		}
		needs, err := loader.NeedsAzureWebHosting(id)
		if err != nil {
			t.Fatalf("NeedsAzureWebHosting %s: %v", id, err)
		}
		if !needs {
			t.Fatalf("%s: expected Function/App Service markers in main.tf", id)
		}
	}
}

func TestNeedsAzureWebHostingScansAllTfFiles(t *testing.T) {
	fsys := fstest.MapFS{
		"split-recipe/main.tf": &fstest.MapFile{Data: []byte(
			`resource "azurerm_resource_group" "rg" {}` + "\n",
		)},
		"split-recipe/hosting.tf": &fstest.MapFile{Data: []byte(
			`resource "azurerm_service_plan" "plan" {}` + "\n",
		)},
	}
	needs, err := NewLoader(fsys).NeedsAzureWebHosting("split-recipe")
	if err != nil {
		t.Fatalf("NeedsAzureWebHosting: %v", err)
	}
	if !needs {
		t.Fatal("hosting resource in a non-main.tf file must flag the recipe")
	}
}

func TestNeedsAzureWebHostingIgnoresCommentsAndOutputs(t *testing.T) {
	fsys := fstest.MapFS{
		"commented/main.tf": &fstest.MapFile{Data: []byte(
			"# unlike azurerm_service_plan, storage works on floci-az\n" +
				`resource "azurerm_storage_account" "sa" {}` + "\n" +
				`output "note" { value = "no azurerm_function_app here" }` + "\n",
		)},
	}
	needs, err := NewLoader(fsys).NeedsAzureWebHosting("commented")
	if err != nil {
		t.Fatalf("NeedsAzureWebHosting: %v", err)
	}
	if needs {
		t.Fatal("comments and outputs mentioning hosting types must not flag the recipe")
	}
}

func TestStorageBlobLabStillAllowsFloci(t *testing.T) {
	recipe, err := Bundled().Load("lab-storage-blobs-azure")
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if len(recipe.Manifest.Local.Runtimes) == 0 {
		t.Fatal("storage blobs lab should still declare floci-az for local dry-run")
	}
	needs, err := Bundled().NeedsAzureWebHosting("lab-storage-blobs-azure")
	if err != nil {
		t.Fatalf("NeedsAzureWebHosting: %v", err)
	}
	if needs {
		t.Fatal("storage blobs lab must not require App Service hosting")
	}
}

func TestPostgresFlexibleLabAllowsFloci(t *testing.T) {
	// floci-az 0.9.0+ emulates Flexible Server with a real postgres container
	// (see floci-io/floci-az #80). Keep the lab on local floci-az.
	recipe, err := Bundled().Load("lab-postgres-flexible-azure")
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	found := false
	for _, runtime := range recipe.Manifest.Local.Runtimes {
		if runtime.ID == "floci-az" {
			found = true
			break
		}
	}
	if !found {
		t.Fatalf("postgres lab should declare floci-az, got %+v", recipe.Manifest.Local.Runtimes)
	}
}

func TestLoadMagentoAWSRecipe(t *testing.T) {
	recipe, err := Bundled().Load("magento-commerce-aws")
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if len(recipe.Manifest.Providers) != 1 || recipe.Manifest.Providers[0] != "aws" {
		t.Fatalf("providers = %+v, want [aws]", recipe.Manifest.Providers)
	}
	if len(recipe.Manifest.Local.Runtimes) != 0 {
		t.Fatalf("expected cloud-only recipe, runtimes = %+v", recipe.Manifest.Local.Runtimes)
	}
	byName := map[string]Variable{}
	for _, v := range recipe.Variables {
		byName[v.Name] = v
	}
	if got := byName["mysql_admin_password"]; !got.Sensitive || got.Widget != "password" {
		t.Fatalf("mysql_admin_password should be sensitive/password: %+v", got)
	}
	if got := byName["magento_image"]; got.Default != "bitnamilegacy/magento-archived:2.4.7" {
		t.Fatalf("magento_image default = %+v", got.Default)
	}
	if got := byName["redis_node_type"]; got.Default != "cache.t3.micro" {
		t.Fatalf("redis_node_type default = %+v", got.Default)
	}
	primary := map[string]bool{}
	for _, output := range recipe.Outputs {
		primary[output.Name] = output.Primary
	}
	if !primary["storefront_url"] || !primary["mysql_host"] {
		t.Fatalf("expected primary storefront_url and mysql_host outputs, got %+v", primary)
	}

	mainTF, err := fsReadRecipeFile("magento-commerce-aws", "main.tf")
	if err != nil {
		t.Fatalf("read magento-commerce-aws main.tf: %v", err)
	}
	for _, want := range []string{
		`engine                 = "mysql"`,
		`resource "aws_elasticache_cluster" "main"`,
		`resource "random_id" "media_bucket_suffix"`,
		`cpu                      = "1024"`,
		`memory                   = "2048"`,
		`MAGENTO_MEDIA_STORAGE_BUCKET`,
	} {
		if !strings.Contains(mainTF, want) {
			t.Fatalf("magento-commerce-aws recipe missing %q", want)
		}
	}
}

func TestLoadMagentoComposeRecipe(t *testing.T) {
	recipe, err := Bundled().Load("magento-commerce-compose")
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if recipe.Manifest.Version != "0.2.0" {
		t.Fatalf("version = %q, want 0.2.0", recipe.Manifest.Version)
	}
	if len(recipe.Manifest.Local.Runtimes) != 1 || recipe.Manifest.Local.Runtimes[0].ID != "magento-compose" {
		t.Fatalf("runtimes = %+v, want magento-compose", recipe.Manifest.Local.Runtimes)
	}
	if len(recipe.Manifest.PostApply) != 2 {
		t.Fatalf("expected two postApply steps, got %+v", recipe.Manifest.PostApply)
	}
	if got := recipe.Manifest.PostApply[0]; got.DirVar != "compose_dir" || got.Requires != "docker-compose.yml" {
		t.Fatalf("postApply start step = %+v", got)
	}
	if got := recipe.Manifest.PostApply[1]; got.Requires != "scripts/setup-official.sh" {
		t.Fatalf("postApply install step = %+v", got)
	}
	byName := map[string]Variable{}
	for _, v := range recipe.Variables {
		byName[v.Name] = v
	}
	if got := byName["compose_dir"]; got.Default != "compose/simple" {
		t.Fatalf("compose_dir default = %+v", got.Default)
	}
	if got := byName["stack_profile"]; got.Default != "simple" || len(got.Options) != 2 {
		t.Fatalf("stack_profile = %+v", got)
	}
	if got := byName["magento_public_key"]; got.VisibleWhen == nil || got.VisibleWhen.Equals != "official" {
		t.Fatalf("magento_public_key visibleWhen = %+v", got.VisibleWhen)
	}
	if got := byName["magento_image_channel"]; got.VisibleWhen == nil || got.VisibleWhen.Equals != "simple" {
		t.Fatalf("magento_image_channel visibleWhen = %+v", got.VisibleWhen)
	}
	primary := map[string]bool{}
	for _, output := range recipe.Outputs {
		primary[output.Name] = output.Primary
	}
	if !primary["storefront_url"] {
		t.Fatalf("expected primary storefront_url output, got %+v", primary)
	}

	simpleYAML, err := fsReadRecipeFile("magento-commerce-compose", filepath.Join("compose", "simple", "docker-compose.yml"))
	if err != nil {
		t.Fatalf("read simple compose file: %v", err)
	}
	for _, want := range []string{
		"mariadb:12.3",
		"redis:8.10-alpine",
		"shinsenter/magento:${MAGENTO_IMAGE_TAG",
		"127.0.0.1:8080:80",
	} {
		if !strings.Contains(simpleYAML, want) {
			t.Fatalf("simple compose file missing %q", want)
		}
	}

	officialYAML, err := fsReadRecipeFile("magento-commerce-compose", filepath.Join("compose", "official", "docker-compose.yml"))
	if err != nil {
		t.Fatalf("read official compose file: %v", err)
	}
	for _, want := range []string{
		"markoshust/magento-nginx",
		"markoshust/magento-php",
		"markoshust/magento-opensearch",
		"markoshust/magento-rabbitmq",
	} {
		if !strings.Contains(officialYAML, want) {
			t.Fatalf("official compose file missing %q", want)
		}
	}
}

func TestLoadMagentoAzureRecipe(t *testing.T) {
	recipe, err := Bundled().Load("magento-commerce-azure")
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if len(recipe.Manifest.Providers) != 1 || recipe.Manifest.Providers[0] != "azure" {
		t.Fatalf("providers = %+v, want [azure]", recipe.Manifest.Providers)
	}
	if len(recipe.Manifest.Local.Runtimes) != 0 {
		t.Fatalf("expected cloud-only recipe, runtimes = %+v", recipe.Manifest.Local.Runtimes)
	}
	byName := map[string]Variable{}
	for _, v := range recipe.Variables {
		byName[v.Name] = v
	}
	if got := byName["mysql_admin_password"]; !got.Sensitive || got.Widget != "password" {
		t.Fatalf("mysql_admin_password should be sensitive/password: %+v", got)
	}
	primary := map[string]bool{}
	for _, output := range recipe.Outputs {
		primary[output.Name] = output.Primary
	}
	if !primary["storefront_url"] || !primary["mysql_host"] {
		t.Fatalf("expected primary storefront_url and mysql_host outputs, got %+v", primary)
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

# Run recipe tests for validation (compact checkpoint resume)
cd D:\Dev\cloud-sprocket\backend\daemon
go test ./internal/recipes/... -run 'TestBundledCatalogV07|TestLoadLabRecipes|TestBundledGuidedLabSpecsValidate|TestLoad' -count=1 2>&1 | Tee-Object -FilePath D:\Dev\cloud-sprocket\terminals\recipes-test-output.txt
echo "Test run complete. See terminals/recipes-test-output.txt"

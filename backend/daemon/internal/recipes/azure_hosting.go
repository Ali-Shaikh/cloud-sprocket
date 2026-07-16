// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package recipes

import (
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path"
	"path/filepath"
	"strings"
)

// Azure web-hosting resource types that floci-az does not fully emulate today
// (App Service plans / Function Apps hang under azurerm LRO).
var azureWebHostingMarkers = []string{
	"azurerm_service_plan",
	"azurerm_function_app",
	"azurerm_linux_function_app",
	"azurerm_windows_function_app",
	"azurerm_linux_web_app",
	"azurerm_windows_web_app",
	"azurerm_app_service",
	"azurerm_app_service_plan",
}

// NeedsAzureWebHosting reports whether the recipe Terraform uses App Service or
// Function App resources that require a real Azure subscription.
func (l *Loader) NeedsAzureWebHosting(id string) (bool, error) {
	id = strings.TrimSpace(id)
	if id == "" {
		return false, fmt.Errorf("recipe id is required")
	}
	if dir, ok := l.findImportedDir(id); ok {
		data, err := os.ReadFile(filepath.Join(dir, "main.tf"))
		if err != nil {
			if os.IsNotExist(err) {
				return false, nil
			}
			return false, err
		}
		return tfNeedsAzureWebHosting(string(data)), nil
	}
	data, err := fs.ReadFile(l.fsys, path.Join(id, "main.tf"))
	if err != nil {
		if errors.Is(err, fs.ErrNotExist) {
			return false, nil
		}
		return false, err
	}
	return tfNeedsAzureWebHosting(string(data)), nil
}

// FlociAzUnsupportedWebHostingMessage is returned when a user tries to plan an
// App Service / Functions recipe against floci-az.
const FlociAzUnsupportedWebHostingMessage = "this recipe needs Azure App Service or Functions hosting, which floci-az does not fully emulate yet. Choose a cloud Azure subscription profile instead of the local floci-az target."

func tfNeedsAzureWebHosting(content string) bool {
	for _, marker := range azureWebHostingMarkers {
		if strings.Contains(content, marker) {
			return true
		}
	}
	return false
}

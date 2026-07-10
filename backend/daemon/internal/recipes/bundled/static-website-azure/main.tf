terraform {
  required_version = ">= 1.6.0"
  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = ">= 4.0"
    }
  }
}

provider "azurerm" {
  features {}
}

locals {
  name = "${var.app_name}-${var.environment}"
  tags = merge({
    App         = var.app_name
    Environment = var.environment
    ManagedBy   = "CloudSprocket"
  }, var.tags)
}

resource "azurerm_resource_group" "main" {
  name     = "${local.name}-rg"
  location = var.azure_location
  tags     = local.tags
}

resource "azurerm_storage_account" "site" {
  name                     = replace("${local.name}site", "-", "")
  resource_group_name      = azurerm_resource_group.main.name
  location                 = azurerm_resource_group.main.location
  account_tier             = "Standard"
  account_replication_type = "LRS"
  static_website {
    index_document = "index.html"
    error_404_document = "index.html"
  }
  tags = local.tags
}

# Upload sample or provided dist to $web container (implicit for static)
locals {
  site_files = var.frontend_dist_dir == "" ? toset([]) : fileset(var.frontend_dist_dir, "**/*")
}

resource "azurerm_storage_blob" "site" {
  for_each               = local.site_files
  name                   = each.value
  storage_account_name   = azurerm_storage_account.site.name
  storage_container_name = "$web"
  type                   = "Block"
  source                 = "${var.frontend_dist_dir}/${each.value}"
  content_type           = lookup({
    html = "text/html",
    css  = "text/css",
    js   = "application/javascript",
  }, lower(element(split(".", each.value), length(split(".", each.value)) - 1)), "application/octet-stream")
}

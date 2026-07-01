terraform {
  required_version = ">= 1.6.0"
  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = ">= 4.0"
    }
  }
}

# On a local deploy CloudSprocket drops a cloudsprocket_floci_az_override.tf next
# to this file. Terraform merges that override into the block below, redirecting
# the provider at floci-az. On a cloud profile this block applies unchanged.
provider "azurerm" {
  features {}
}

locals {
  name = "${var.app_name}-${var.environment}"
  tags = merge({
    App         = var.app_name
    Environment = var.environment
    ManagedBy   = "CloudSprocket"
    Workload    = "postgres-lab"
  }, var.tags)
}

resource "azurerm_resource_group" "main" {
  name     = "${local.name}-rg"
  location = var.azure_location
  tags     = local.tags
}

resource "azurerm_postgresql_flexible_server" "main" {
  name                          = "${local.name}-pg"
  resource_group_name           = azurerm_resource_group.main.name
  location                      = azurerm_resource_group.main.location
  version                       = var.pg_version
  administrator_login           = var.pg_admin_username
  administrator_password        = var.pg_admin_password
  sku_name                      = var.pg_sku_name
  storage_mb                    = var.pg_storage_mb
  public_network_access_enabled = true
  zone                          = "1"
  tags                          = local.tags
}

resource "azurerm_postgresql_flexible_server_database" "main" {
  name      = var.database_name
  server_id = azurerm_postgresql_flexible_server.main.id
  charset   = "UTF8"
  collation = "en_US.utf8"
}

# Permissive rule for local development. Tighten or remove before using on a real
# Azure subscription.
resource "azurerm_postgresql_flexible_server_firewall_rule" "allow_all" {
  name             = "allow-all-dev"
  server_id        = azurerm_postgresql_flexible_server.main.id
  start_ip_address = "0.0.0.0"
  end_ip_address   = "255.255.255.255"
}

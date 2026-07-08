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
  features {
    key_vault {
      purge_soft_delete_on_destroy    = true
      recover_soft_deleted_key_vaults = true
    }
  }
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

resource "azurerm_key_vault" "main" {
  name                        = replace("${local.name}kv", "-", "")
  location                    = azurerm_resource_group.main.location
  resource_group_name         = azurerm_resource_group.main.name
  tenant_id                   = "00000000-0000-0000-0000-000000000002" # placeholder for local
  sku_name                    = "standard"
  soft_delete_retention_days  = 7
  purge_protection_enabled    = false
  tags                        = local.tags
}

resource "azurerm_key_vault_secret" "demo" {
  name         = "demo-secret"
  value        = "cloud-sprocket-value"
  key_vault_id = azurerm_key_vault.main.id
}

resource "azurerm_storage_account" "func" {
  name                     = replace("${local.name}kfunc", "-", "")
  resource_group_name      = azurerm_resource_group.main.name
  location                 = azurerm_resource_group.main.location
  account_tier             = "Standard"
  account_replication_type = "LRS"
  tags                     = local.tags
}

resource "azurerm_service_plan" "func" {
  name                = "${local.name}-plan"
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location
  os_type             = "Linux"
  sku_name            = "Y1"
  tags                = local.tags
}

resource "azurerm_linux_function_app" "main" {
  name                = "${local.name}-kvfunc"
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location

  storage_account_name       = azurerm_storage_account.func.name
  storage_account_access_key = azurerm_storage_account.func.primary_access_key
  service_plan_id            = azurerm_service_plan.func.id

  identity {
    type = "SystemAssigned"
  }

  site_config {
    application_stack {
      node_version = "20"
    }
  }

  app_settings = {
    FUNCTIONS_WORKER_RUNTIME = "node"
    AzureWebJobsStorage      = azurerm_storage_account.func.primary_connection_string
  }

  tags = local.tags
}

# Grant access (simplified for demo; in real use RBAC or policy)
resource "azurerm_key_vault_access_policy" "func" {
  key_vault_id = azurerm_key_vault.main.id
  tenant_id    = azurerm_key_vault.main.tenant_id
  object_id    = azurerm_linux_function_app.main.identity[0].principal_id

  secret_permissions = ["Get", "List"]
}

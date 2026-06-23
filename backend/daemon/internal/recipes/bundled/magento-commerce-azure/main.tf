terraform {
  required_version = ">= 1.6.0"
  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = ">= 3.0"
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
    Workload    = "magento"
  }, var.tags)
}

resource "azurerm_resource_group" "main" {
  name     = "${local.name}-rg"
  location = var.azure_location
  tags     = local.tags
}

resource "azurerm_service_plan" "main" {
  name                = "${local.name}-plan"
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  os_type             = "Linux"
  sku_name            = var.app_service_sku
  tags                = local.tags
}

resource "azurerm_storage_account" "media" {
  name                     = replace("${local.name}media", "-", "")
  resource_group_name      = azurerm_resource_group.main.name
  location                 = azurerm_resource_group.main.location
  account_tier             = "Standard"
  account_replication_type = "LRS"
  tags                     = local.tags
}

resource "azurerm_redis_cache" "main" {
  name                = "${local.name}-redis"
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  capacity            = 0
  family              = "C"
  sku_name            = "Basic"
  minimum_tls_version = "1.2"
  tags                = local.tags
}

resource "azurerm_mysql_flexible_server" "main" {
  name                   = "${local.name}-mysql"
  location               = azurerm_resource_group.main.location
  resource_group_name    = azurerm_resource_group.main.name
  administrator_login    = var.mysql_admin_username
  administrator_password = var.mysql_admin_password
  sku_name               = var.mysql_sku_name
  version                = "8.0.21"
  storage {
    size_gb = 32
  }
  tags = local.tags
}

resource "azurerm_mysql_flexible_database" "magento" {
  name                  = "magento"
  resource_group_name   = azurerm_resource_group.main.name
  server_name           = azurerm_mysql_flexible_server.main.name
  charset               = "utf8mb4"
  collation             = "utf8mb4_unicode_ci"
}

resource "azurerm_mysql_flexible_server_firewall_rule" "azure_services" {
  name                = "allow-azure-services"
  resource_group_name = azurerm_resource_group.main.name
  server_name         = azurerm_mysql_flexible_server.main.name
  start_ip_address    = "0.0.0.0"
  end_ip_address      = "0.0.0.0"
}

resource "azurerm_linux_web_app" "magento" {
  name                = "${local.name}-store"
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  service_plan_id     = azurerm_service_plan.main.id
  https_only          = true
  tags                = local.tags

  site_config {
    always_on = true
    application_stack {
      docker_image_name   = var.magento_image
      docker_registry_url = "https://index.docker.io"
    }
  }

  app_settings = {
    MAGENTO_BASE_URL              = var.magento_base_url
    MAGENTO_DATABASE_HOST         = azurerm_mysql_flexible_server.main.fqdn
    MAGENTO_DATABASE_PORT_NUMBER  = "3306"
    MAGENTO_DATABASE_USER         = var.mysql_admin_username
    MAGENTO_DATABASE_PASSWORD     = var.mysql_admin_password
    MAGENTO_DATABASE_NAME         = azurerm_mysql_flexible_database.magento.name
    MAGENTO_REDIS_HOST            = azurerm_redis_cache.main.hostname
    MAGENTO_REDIS_PORT_NUMBER     = "6380"
    MAGENTO_REDIS_PASSWORD        = azurerm_redis_cache.main.primary_access_key
    MAGENTO_REDIS_USE_SSL         = "true"
    MAGENTO_MEDIA_STORAGE_ACCOUNT = azurerm_storage_account.media.name
    WEBSITES_PORT                 = "8080"
    WEBSITES_ENABLE_APP_SERVICE_STORAGE = "false"
  }
}
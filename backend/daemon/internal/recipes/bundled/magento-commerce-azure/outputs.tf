output "storefront_url" {
  description = "Default Azure Websites URL for the Magento storefront."
  value       = "https://${azurerm_linux_web_app.magento.default_hostname}"
}

output "resource_group_name" {
  description = "Resource group containing the Magento stack."
  value       = azurerm_resource_group.main.name
}

output "mysql_host" {
  description = "MySQL Flexible Server hostname."
  value       = azurerm_mysql_flexible_server.main.fqdn
}

output "mysql_database_name" {
  description = "Magento database name."
  value       = azurerm_mysql_flexible_database.magento.name
}

output "redis_hostname" {
  description = "Redis cache hostname for Magento sessions and cache."
  value       = azurerm_redis_cache.main.hostname
}

output "storage_account_name" {
  description = "Storage account for Magento media assets."
  value       = azurerm_storage_account.media.name
}

output "app_service_name" {
  description = "Linux Web App hosting Magento."
  value       = azurerm_linux_web_app.magento.name
}
output "storage_account_name" {
  description = "Storage account name."
  value       = azurerm_storage_account.main.name
}

output "container_name" {
  description = "Blob container name."
  value       = azurerm_storage_container.main.name
}

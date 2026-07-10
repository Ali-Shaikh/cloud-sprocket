output "storage_account_name" {
  description = "Name of the storage account used for events."
  value       = azurerm_storage_account.main.name
}

output "function_app_name" {
  description = "Name of the function app (for blob event pattern)."
  value       = azurerm_linux_function_app.main.name
}

output "container_name" {
  description = "Blob container for event triggers."
  value       = azurerm_storage_container.events.name
}

output "storage_account_name" {
  description = "Name of the storage account."
  value       = azurerm_storage_account.main.name
}

output "queue_name" {
  description = "Name of the storage queue."
  value       = azurerm_storage_queue.main.name
}

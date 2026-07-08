output "function_app_name" {
  description = "Function app name."
  value       = azurerm_linux_function_app.main.name
}

output "storage_account_name" {
  description = "Storage account backing functions and queue."
  value       = azurerm_storage_account.func.name
}

output "queue_name" {
  description = "Name of the work queue."
  value       = azurerm_storage_queue.work.name
}

output "resource_group_name" {
  description = "Resource group."
  value       = azurerm_resource_group.main.name
}

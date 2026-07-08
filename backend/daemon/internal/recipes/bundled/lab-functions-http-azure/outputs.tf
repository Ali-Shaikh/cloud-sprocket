output "function_app_name" {
  description = "Name of the function app."
  value       = azurerm_linux_function_app.main.name
}

output "storage_account_name" {
  description = "Backing storage account name."
  value       = azurerm_storage_account.func.name
}

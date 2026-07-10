output "storage_account_name" {
  description = "Storage account."
  value       = azurerm_storage_account.main.name
}

output "function_app_name" {
  description = "Function app."
  value       = azurerm_linux_function_app.main.name
}

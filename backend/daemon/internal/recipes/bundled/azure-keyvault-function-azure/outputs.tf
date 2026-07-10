output "key_vault_name" {
  description = "Key Vault name."
  value       = azurerm_key_vault.main.name
}

output "function_app_name" {
  description = "Function app name."
  value       = azurerm_linux_function_app.main.name
}

output "resource_group_name" {
  description = "Resource group."
  value       = azurerm_resource_group.main.name
}

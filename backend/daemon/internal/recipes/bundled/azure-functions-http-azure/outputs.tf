output "function_app_name" {
  description = "Name of the Function App."
  value       = azurerm_linux_function_app.main.name
}

output "function_app_url" {
  description = "Base URL for the function app (append /api/YourFunction for triggers)."
  value       = "https://${azurerm_linux_function_app.main.default_hostname}"
}

output "resource_group_name" {
  description = "Resource group."
  value       = azurerm_resource_group.main.name
}

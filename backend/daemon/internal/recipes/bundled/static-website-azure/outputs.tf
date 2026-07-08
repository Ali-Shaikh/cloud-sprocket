output "website_url" {
  description = "Static website primary URL."
  value       = azurerm_storage_account.site.primary_web_endpoint
}

output "storage_account_name" {
  description = "Storage account name."
  value       = azurerm_storage_account.site.name
}

output "key_vault_name" {
  description = "Name of the Key Vault."
  value       = azurerm_key_vault.main.name
}

output "secret_name" {
  description = "Name of the secret inside the vault."
  value       = azurerm_key_vault_secret.lab.name
}

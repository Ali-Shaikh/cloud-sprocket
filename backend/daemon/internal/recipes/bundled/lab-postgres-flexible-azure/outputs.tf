output "server_name" {
  description = "Name of the PostgreSQL flexible server."
  value       = azurerm_postgresql_flexible_server.main.name
}

output "server_fqdn" {
  description = "Server FQDN for client connections."
  value       = azurerm_postgresql_flexible_server.main.fqdn
}

output "database_name" {
  description = "Starter database name."
  value       = azurerm_postgresql_flexible_server_database.main.name
}

output "resource_group_name" {
  description = "Resource group holding the server."
  value       = azurerm_resource_group.main.name
}

output "admin_username" {
  description = "Administrator login."
  value       = var.pg_admin_username
}

output "connection_hint" {
  description = "How to obtain a connection string."
  value = "Connect to ${azurerm_postgresql_flexible_server.main.fqdn}:5432 as ${var.pg_admin_username} over TLS 1.2+ (database ${azurerm_postgresql_flexible_server_database.main.name})."
}

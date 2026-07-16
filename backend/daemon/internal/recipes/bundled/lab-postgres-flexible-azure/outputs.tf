output "server_name" {
  description = "Name of the PostgreSQL flexible server."
  value       = azurerm_postgresql_flexible_server.main.name
}

output "server_fqdn" {
  description = "Server FQDN. floci-az returns localhost; use /connect for the host port."
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
  value = "Local: GET ${azurerm_postgresql_flexible_server.main.name}/connect on floci-az for host port + psql/JDBC/URI strings (sslmode=disable). Cloud: connect to ${azurerm_postgresql_flexible_server.main.fqdn}:5432 over TLS."
}

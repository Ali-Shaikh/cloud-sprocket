output "api_endpoint" {
  description = "Base URL of the backend HTTP API."
  value       = "http://${aws_lb.main.dns_name}"
}

output "database_endpoint" {
  description = "Postgres connection endpoint (host:port)."
  value       = aws_db_instance.main.endpoint
}

output "database_url" {
  description = "Postgres connection URL for your application."
  value       = "postgres://${var.db_username}:${var.db_password}@${aws_db_instance.main.endpoint}/app"
  sensitive   = true
}

output "ecs_cluster" {
  description = "ECS cluster name."
  value       = aws_ecs_cluster.main.name
}
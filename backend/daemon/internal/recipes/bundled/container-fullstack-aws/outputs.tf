output "alb_dns_name" {
  description = "Public DNS name of the application load balancer."
  value       = aws_lb.main.dns_name
}

output "frontend_url" {
  description = "CloudFront URL serving the static frontend."
  value       = "https://${aws_cloudfront_distribution.frontend.domain_name}"
}

output "database_endpoint" {
  description = "Postgres connection endpoint."
  value       = aws_db_instance.main.endpoint
}

output "ecs_cluster" {
  description = "ECS cluster name."
  value       = aws_ecs_cluster.main.name
}

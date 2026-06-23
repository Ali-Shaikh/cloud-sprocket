output "storefront_url" {
  description = "HTTP URL of the Magento storefront behind the Application Load Balancer."
  value       = "http://${aws_lb.main.dns_name}"
}

output "mysql_host" {
  description = "RDS MySQL hostname."
  value       = aws_db_instance.main.address
}

output "mysql_database_name" {
  description = "Magento database name."
  value       = aws_db_instance.main.db_name
}

output "redis_hostname" {
  description = "ElastiCache Redis hostname for Magento sessions and cache."
  value       = aws_elasticache_cluster.main.cache_nodes[0].address
}

output "media_bucket_name" {
  description = "S3 bucket for Magento media assets."
  value       = aws_s3_bucket.media.bucket
}

output "ecs_cluster" {
  description = "ECS cluster name."
  value       = aws_ecs_cluster.main.name
}
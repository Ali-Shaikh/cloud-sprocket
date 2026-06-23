variable "app_name" {
  type        = string
  description = "Lowercase name prefix used for every resource."
  default     = "magento"
}

variable "environment" {
  type        = string
  description = "Deployment environment."
  default     = "dev"
}

variable "aws_region" {
  type        = string
  description = "AWS region to deploy into."
  default     = "us-east-1"
}

variable "magento_base_url" {
  type        = string
  description = "Public base URL for the Magento storefront."
  default     = "http://localhost:8080"
}

variable "magento_image" {
  type        = string
  description = "Docker image for the Magento ECS task."
  default     = "bitnamilegacy/magento:2.4.6"
}

variable "desired_count" {
  type        = number
  description = "Number of Fargate tasks to run."
  default     = 1
}

variable "mysql_admin_username" {
  type        = string
  description = "Master username for the MySQL database."
  default     = "magento"
}

variable "mysql_admin_password" {
  type        = string
  description = "Master password for the MySQL database."
  sensitive   = true
  default     = "ChangeMe-Magento-2026!"
}

variable "db_instance_class" {
  type        = string
  description = "RDS instance class."
  default     = "db.t3.micro"
}

variable "redis_node_type" {
  type        = string
  description = "ElastiCache node type for Redis."
  default     = "cache.t3.micro"
}

variable "tags" {
  type        = map(string)
  description = "Extra tags applied to every resource."
  default     = {}
}
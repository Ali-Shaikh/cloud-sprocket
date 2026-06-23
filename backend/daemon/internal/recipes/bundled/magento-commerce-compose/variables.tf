variable "app_name" {
  type        = string
  description = "Lowercase name prefix recorded in deployment outputs."
  default     = "magento"
}

variable "environment" {
  type        = string
  description = "Deployment environment."
  default     = "dev"
}

variable "stack_profile" {
  type        = string
  description = "Local Magento stack profile: simple (shinsenter) or official (Adobe OSS via Composer)."
  default     = "simple"
}

variable "magento_image_channel" {
  type        = string
  description = "shinsenter image channel for the simple profile: latest or stable."
  default     = "latest"
}

variable "magento_public_key" {
  type        = string
  description = "Adobe Marketplace public key for Composer (official profile)."
  default     = ""
  sensitive   = true
}

variable "magento_private_key" {
  type        = string
  description = "Adobe Marketplace private key for Composer (official profile)."
  default     = ""
  sensitive   = true
}

variable "magento_admin_user" {
  type        = string
  description = "Magento admin username created by setup:install (official profile)."
  default     = "admin"
}

variable "magento_admin_password" {
  type        = string
  description = "Magento admin password created by setup:install (official profile)."
  default     = "Admin123!"
  sensitive   = true
}

variable "magento_admin_email" {
  type        = string
  description = "Magento admin email created by setup:install (official profile)."
  default     = "admin@example.com"
}

variable "expose_debug_ports" {
  type        = bool
  description = "Publish MariaDB, OpenSearch, and RabbitMQ ports on 127.0.0.1 (official profile)."
  default     = false
}

variable "magento_base_url" {
  type        = string
  description = "Public base URL for the Magento storefront."
  default     = "http://localhost:8080"
}

variable "compose_dir" {
  type        = string
  description = "Directory containing docker-compose.yml relative to the deployment workspace."
  default     = "compose/simple"
}
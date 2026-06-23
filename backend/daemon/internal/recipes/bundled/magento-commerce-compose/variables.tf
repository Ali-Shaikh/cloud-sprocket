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

variable "magento_base_url" {
  type        = string
  description = "Public base URL for the Magento storefront."
  default     = "http://localhost:8080"
}

variable "compose_dir" {
  type        = string
  description = "Directory containing docker-compose.yml relative to the deployment workspace."
  default     = "compose"
}
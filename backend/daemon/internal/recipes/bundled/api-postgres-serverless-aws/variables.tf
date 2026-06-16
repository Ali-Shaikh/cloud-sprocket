variable "app_name" {
  type        = string
  description = "Lowercase name prefix used for every resource."
  default     = "myapi"

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{1,30}$", var.app_name))
    error_message = "app_name must be lowercase letters, digits or hyphens, 2-31 characters, starting with a letter."
  }
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

variable "lambda_memory_mb" {
  type        = number
  description = "Memory for the API Lambda, in megabytes."
  default     = 256
}

variable "db_username" {
  type        = string
  description = "Master username for the Postgres database."
  default     = "appuser"
}

variable "db_password" {
  type        = string
  description = "Master password for the Postgres database."
  sensitive   = true
  default     = "changeme-please"
}

variable "db_instance_class" {
  type        = string
  description = "RDS instance class."
  default     = "db.t3.micro"
}

variable "backend_source_dir" {
  type        = string
  description = "Directory containing your Node backend with a handler.handler export."
  default     = "./sample-api"
}

variable "tags" {
  type        = map(string)
  description = "Extra tags applied to every resource."
  default     = {}
}
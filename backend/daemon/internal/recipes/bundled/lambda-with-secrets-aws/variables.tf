variable "app_name" {
  type        = string
  description = "Lowercase name prefix."
  default     = "seclambda"

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
  description = "AWS region."
  default     = "us-east-1"
}

variable "secret_name" {
  type        = string
  description = "Name of the secret in Secrets Manager."
  default     = ""
}

variable "backend_source_dir" {
  type        = string
  description = "Handler dir. Default sample."
  default     = "./sample-fn"
}

variable "lambda_memory_mb" {
  type        = number
  description = "Lambda memory MB."
  default     = 128
}

variable "tags" {
  type        = map(string)
  description = "Tags."
  default     = {}
}

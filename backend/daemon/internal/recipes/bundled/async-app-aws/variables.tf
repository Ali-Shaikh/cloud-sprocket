variable "app_name" {
  type        = string
  description = "Lowercase name prefix used for every resource."
  default     = "myapp"

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

variable "api_source_dir" {
  type        = string
  description = "Directory containing your Node API with a handler.handler export. Leave as the default to deploy the sample API."
  default     = "./sample-api"
}

variable "worker_source_dir" {
  type        = string
  description = "Directory containing your Node worker with a handler.handler export. Leave as the default to deploy the sample worker."
  default     = "./sample-worker"
}

variable "frontend_dist_dir" {
  type        = string
  description = "Directory of your built static frontend (e.g. a Next.js `out/` export). Leave as the default to deploy the sample frontend, or set to an empty string to skip the frontend."
  default     = "./sample-site"
}

variable "lambda_memory_mb" {
  type        = number
  description = "Memory for both Lambda functions, in megabytes."
  default     = 256
}

variable "tags" {
  type        = map(string)
  description = "Extra tags applied to every resource."
  default     = {}
}
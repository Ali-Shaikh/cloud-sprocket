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

variable "lambda_memory_mb" {
  type        = number
  description = "Memory for the API Lambda, in megabytes."
  default     = 256
}

variable "enable_point_in_time_recovery" {
  type        = bool
  description = "Enable DynamoDB point-in-time recovery."
  default     = false
}

variable "tags" {
  type        = map(string)
  description = "Extra tags applied to every resource."
  default     = {}
}

variable "backend_source_dir" {
  type        = string
  description = "Directory containing your Node backend (a package.json with a handler.handler export). Leave as the default to deploy the sample handler."
  default     = "./src"
}

variable "frontend_dist_dir" {
  type        = string
  description = "Directory of your built static frontend (e.g. a Next.js `out/` export). Leave blank to create an empty bucket."
  default     = ""
}

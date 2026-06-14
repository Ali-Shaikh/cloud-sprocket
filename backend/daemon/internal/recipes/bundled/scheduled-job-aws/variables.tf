variable "app_name" {
  type        = string
  description = "Lowercase name prefix used for every resource."
  default     = "myjob"

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

variable "schedule_expression" {
  type        = string
  description = "EventBridge schedule expression, e.g. `rate(5 minutes)` or `cron(0 12 * * ? *)`."
  default     = "rate(5 minutes)"
}

variable "backend_source_dir" {
  type        = string
  description = "Directory containing your Node job (a package.json with a handler.handler export). Leave as the default to deploy the sample handler."
  default     = "./src"
}

variable "lambda_memory_mb" {
  type        = number
  description = "Memory for the job Lambda, in megabytes."
  default     = 128
}

variable "tags" {
  type        = map(string)
  description = "Extra tags applied to every resource."
  default     = {}
}

variable "app_name" {
  type        = string
  description = "Lowercase name prefix used for every resource."
  default     = "ebproc"

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
  description = "Schedule expression for EventBridge (e.g. rate(5 minutes)). Leave blank to use event_pattern."
  default     = "rate(1 minute)"
}

variable "event_pattern" {
  type        = string
  description = "JSON event pattern to match (alternative to schedule). Leave blank to use schedule_expression."
  default     = ""
}

variable "backend_source_dir" {
  type        = string
  description = "Directory containing your Node processor with handler.handler export. Leave default for sample."
  default     = "./sample-processor"
}

variable "lambda_memory_mb" {
  type        = number
  description = "Memory for the Lambda, in megabytes."
  default     = 128
}

variable "tags" {
  type        = map(string)
  description = "Extra tags applied to every resource."
  default     = {}
}

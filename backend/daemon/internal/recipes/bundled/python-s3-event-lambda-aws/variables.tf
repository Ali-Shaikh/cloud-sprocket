variable "app_name" {
  type        = string
  description = "Lowercase name prefix."
  default     = "pys3evt"

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{1,30}$", var.app_name))
    error_message = "app_name must be lowercase letters, digits or hyphens, 2-31 characters, starting with a letter."
  }
}

variable "environment" {
  type        = string
  description = "Environment."
  default     = "dev"
}

variable "aws_region" {
  type        = string
  description = "Region."
  default     = "us-east-1"
}

variable "backend_source_dir" {
  type        = string
  description = "Python dir with lambda_function.py . Default sample."
  default     = "./sample-python"
}

variable "tags" {
  type        = map(string)
  description = "Tags."
  default     = {}
}

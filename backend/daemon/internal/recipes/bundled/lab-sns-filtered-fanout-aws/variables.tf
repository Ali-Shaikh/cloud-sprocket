variable "app_name" {
  type        = string
  description = "Lowercase name prefix used for every resource."
  default     = "mysnsfan"

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

variable "tags" {
  type        = map(string)
  description = "Extra tags applied to every resource."
  default     = {}
}

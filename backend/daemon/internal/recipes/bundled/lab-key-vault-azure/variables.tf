variable "app_name" {
  type        = string
  description = "Lowercase name prefix used for every resource."
  default     = "myazkv"

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{1,15}$", var.app_name))
    error_message = "app_name must be lowercase letters, digits or hyphens, 2-16 characters, starting with a letter."
  }
}

variable "environment" {
  type        = string
  description = "Deployment environment."
  default     = "dev"
}

variable "azure_location" {
  type        = string
  description = "Azure location for resources."
  default     = "westeurope"
}

variable "secret_value" {
  type        = string
  description = "Initial secret value."
  default     = "change-me-in-rotation"
  sensitive   = true
}

variable "tags" {
  type        = map(string)
  description = "Extra tags applied to every resource."
  default     = {}
}

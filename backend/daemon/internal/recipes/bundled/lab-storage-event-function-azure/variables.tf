variable "app_name" {
  type        = string
  description = "Lowercase name prefix used for every resource."
  default     = "myazevt"

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{1,20}$", var.app_name))
    error_message = "app_name must be lowercase letters, digits or hyphens, 2-21 characters, starting with a letter."
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

variable "tags" {
  type        = map(string)
  description = "Extra tags applied to every resource."
  default     = {}
}

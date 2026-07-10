variable "app_name" {
  type        = string
  description = "Lowercase name prefix used for every resource."
  default     = "azqfunc"

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

variable "azure_location" {
  type        = string
  description = "Azure region."
  default     = "westeurope"
}

variable "backend_source_dir" {
  type        = string
  description = "Function source. Default sample."
  default     = "./sample-qfunc"
}

variable "tags" {
  type        = map(string)
  description = "Tags."
  default     = {}
}

variable "app_name" {
  type        = string
  description = "Lowercase name prefix used for every resource."
  default     = "azfunc"

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
  description = "Azure region (floci-az ignores)."
  default     = "westeurope"
}

variable "backend_source_dir" {
  type        = string
  description = "Functions source dir with host.json etc. Default sample."
  default     = "./sample-func"
}

variable "tags" {
  type        = map(string)
  description = "Extra tags as map."
  default     = {}
}

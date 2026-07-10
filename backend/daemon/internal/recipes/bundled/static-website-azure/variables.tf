variable "app_name" {
  type        = string
  description = "Lowercase name prefix."
  default     = "azsite"

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

variable "azure_location" {
  type        = string
  description = "Location."
  default     = "westeurope"
}

variable "frontend_dist_dir" {
  type        = string
  description = "Site files dir. Default sample."
  default     = "./sample-site"
}

variable "tags" {
  type        = map(string)
  description = "Tags."
  default     = {}
}

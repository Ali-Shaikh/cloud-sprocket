variable "app_name" {
  type        = string
  description = "Lowercase name prefix."
  default     = "azblobe"

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

variable "backend_source_dir" {
  type        = string
  description = "Code dir. Default sample."
  default     = "./sample-blobfunc"
}

variable "tags" {
  type        = map(string)
  description = "Tags."
  default     = {}
}

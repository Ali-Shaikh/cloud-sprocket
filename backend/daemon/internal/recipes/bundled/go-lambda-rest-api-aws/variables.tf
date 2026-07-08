variable "app_name" {
  type        = string
  description = "Lowercase name prefix."
  default     = "gorest"

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
  description = "Go source dir containing main.go and go.mod . Builds to bootstrap."
  default     = "./sample-go"
}

variable "tags" {
  type        = map(string)
  description = "Tags."
  default     = {}
}

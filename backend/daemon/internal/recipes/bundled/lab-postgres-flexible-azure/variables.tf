variable "app_name" {
  type        = string
  description = "Lowercase name prefix used for every resource."
  default     = "pglab"
}

variable "environment" {
  type        = string
  description = "Deployment environment (dev, staging, prod)."
  default     = "dev"
}

variable "azure_location" {
  type        = string
  description = "Azure region. Ignored by floci-az local."
  default     = "westeurope"
}

variable "pg_admin_username" {
  type        = string
  description = "Administrator login for the flexible server."
  default     = "pgadmin"
}

variable "pg_admin_password" {
  type        = string
  description = "Administrator password for the flexible server."
  sensitive   = true
  default     = "Ch4ngeMe-local-dev!"
}

variable "pg_version" {
  type        = string
  description = "PostgreSQL major version."
  default     = "16"
}

variable "pg_sku_name" {
  type        = string
  description = "Compute SKU. Ignored by floci-az local."
  default     = "B_Standard_B1ms"
}

variable "pg_storage_mb" {
  type        = number
  description = "Provisioned storage in MB. Ignored by floci-az local."
  default     = 32768
}

variable "database_name" {
  type        = string
  description = "Name of the starter database created on the server."
  default     = "appdb"
}

variable "tags" {
  type        = map(string)
  description = "Extra tags applied to every resource."
  default     = {}
}

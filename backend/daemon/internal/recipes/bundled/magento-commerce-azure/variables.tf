variable "app_name" {
  type        = string
  description = "Lowercase name prefix used for every resource."
  default     = "magento"
}

variable "environment" {
  type        = string
  description = "Deployment environment."
  default     = "dev"
}

variable "azure_location" {
  type        = string
  description = "Azure region to deploy into."
  default     = "westeurope"
}

variable "magento_base_url" {
  type        = string
  description = "Public base URL for the Magento storefront."
  default     = "https://magento-dev.azurewebsites.net"
}

variable "magento_image" {
  type        = string
  description = "Docker image for the Magento Linux Web App."
  default     = "bitnamilegacy/magento:2.4.6"
}

variable "app_service_sku" {
  type        = string
  description = "SKU for the Linux App Service plan."
  default     = "B1"
}

variable "mysql_admin_username" {
  type        = string
  description = "Administrator username for Azure Database for MySQL."
  default     = "magento"
}

variable "mysql_admin_password" {
  type        = string
  description = "Administrator password for Azure Database for MySQL."
  sensitive   = true
  default     = "ChangeMe-Magento-2026!"
}

variable "mysql_sku_name" {
  type        = string
  description = "SKU for the MySQL Flexible Server."
  default     = "B_Standard_B1ms"
}

variable "tags" {
  type        = map(string)
  description = "Extra tags applied to every resource."
  default     = {}
}
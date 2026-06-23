terraform {
  required_version = ">= 1.6.0"
}

locals {
  name = "${var.app_name}-${var.environment}"
}
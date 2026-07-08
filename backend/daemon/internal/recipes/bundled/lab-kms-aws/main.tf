terraform {
  required_version = ">= 1.6.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
}

locals {
  name = "${var.app_name}-${var.environment}"
  tags = merge({
    App         = var.app_name
    Environment = var.environment
    ManagedBy   = "CloudSprocket"
  }, var.tags)
}

resource "aws_kms_key" "lab" {
  description             = "KMS key for ${local.name} lab"
  deletion_window_in_days = 7
  enable_key_rotation     = true
  tags                    = local.tags
}

resource "aws_kms_alias" "lab" {
  name          = "alias/${local.name}-key"
  target_key_id = aws_kms_key.lab.key_id
}

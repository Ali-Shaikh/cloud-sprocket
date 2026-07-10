terraform {
  required_version = ">= 1.6.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 5.0"
    }
    archive = {
      source  = "hashicorp/archive"
      version = ">= 2.4"
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

data "archive_file" "fn" {
  type        = "zip"
  output_path = "${path.module}/.build/fn.zip"
  source_dir  = var.backend_source_dir
}

resource "aws_iam_role" "lambda" {
  name = "${local.name}-secrets-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
    }]
  })

  tags = local.tags
}

resource "aws_secretsmanager_secret" "app" {
  name        = var.secret_name != "" ? var.secret_name : "${local.name}-secret"
  description = "Secret for ${local.name}"
  tags        = local.tags
}

resource "aws_secretsmanager_secret_version" "app" {
  secret_id     = aws_secretsmanager_secret.app.id
  secret_string = jsonencode({ demo = "value", env = var.environment })
}

resource "aws_iam_role_policy" "lambda_secrets" {
  name = "${local.name}-read-secret"
  role = aws_iam_role.lambda.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["secretsmanager:GetSecretValue"]
      Resource = aws_secretsmanager_secret.app.arn
    }]
  })
}

resource "aws_lambda_function" "fn" {
  function_name    = "${local.name}-fn"
  role             = aws_iam_role.lambda.arn
  handler          = "handler.handler"
  runtime          = "nodejs22.x"
  filename         = data.archive_file.fn.output_path
  source_code_hash = data.archive_file.fn.output_base64sha256
  memory_size      = var.lambda_memory_mb

  tags = local.tags
}

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

data "archive_file" "subscriber" {
  type        = "zip"
  output_path = "${path.module}/.build/subscriber.zip"
  source_dir  = var.backend_source_dir
}

resource "aws_iam_role" "lambda" {
  name = "${local.name}-sns-role"

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

resource "aws_lambda_function" "subscriber" {
  function_name    = "${local.name}-subscriber"
  role             = aws_iam_role.lambda.arn
  handler          = "handler.handler"
  runtime          = "nodejs22.x"
  filename         = data.archive_file.subscriber.output_path
  source_code_hash = data.archive_file.subscriber.output_base64sha256
  memory_size      = var.lambda_memory_mb

  tags = local.tags
}

resource "aws_sns_topic" "main" {
  name = "${local.name}-topic"
  tags = local.tags
}

resource "aws_sns_topic_subscription" "lambda" {
  topic_arn = aws_sns_topic.main.arn
  protocol  = "lambda"
  endpoint  = aws_lambda_function.subscriber.arn
}

resource "aws_lambda_permission" "sns" {
  statement_id  = "AllowSNSInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.subscriber.function_name
  principal     = "sns.amazonaws.com"
  source_arn    = aws_sns_topic.main.arn
}

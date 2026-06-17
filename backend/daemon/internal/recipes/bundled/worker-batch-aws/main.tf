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

resource "aws_s3_bucket" "batch" {
  bucket = "${local.name}-batch"
  tags   = local.tags
}

resource "aws_s3_bucket_public_access_block" "batch" {
  bucket = aws_s3_bucket.batch.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_dynamodb_table" "jobs" {
  name         = "${local.name}-jobs"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "jobId"

  attribute {
    name = "jobId"
    type = "S"
  }

  tags = local.tags
}

resource "aws_sqs_queue" "dlq" {
  name = "${local.name}-dlq"
  tags = local.tags
}

resource "aws_sqs_queue" "main" {
  name = "${local.name}-queue"

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.dlq.arn
    maxReceiveCount     = 3
  })

  tags = local.tags
}

data "archive_file" "worker" {
  type        = "zip"
  output_path = "${path.module}/.build/worker.zip"
  source_dir  = var.worker_source_dir
}

resource "aws_iam_role" "worker" {
  name = "${local.name}-worker-role"

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

resource "aws_iam_role_policy" "worker_sqs" {
  name = "${local.name}-sqs-receive"
  role = aws_iam_role.worker.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "sqs:ReceiveMessage",
        "sqs:DeleteMessage",
        "sqs:GetQueueAttributes",
      ]
      Resource = aws_sqs_queue.main.arn
    }]
  })
}

resource "aws_iam_role_policy" "worker_s3" {
  name = "${local.name}-s3-batch"
  role = aws_iam_role.worker.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "s3:GetObject",
        "s3:PutObject",
        "s3:ListBucket",
      ]
      Resource = [
        aws_s3_bucket.batch.arn,
        "${aws_s3_bucket.batch.arn}/*",
      ]
    }]
  })
}

resource "aws_iam_role_policy" "worker_dynamodb" {
  name = "${local.name}-dynamodb"
  role = aws_iam_role.worker.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "dynamodb:PutItem",
        "dynamodb:UpdateItem",
        "dynamodb:GetItem",
      ]
      Resource = aws_dynamodb_table.jobs.arn
    }]
  })
}

resource "aws_lambda_function" "worker" {
  function_name    = "${local.name}-worker"
  role             = aws_iam_role.worker.arn
  handler          = "handler.handler"
  runtime          = "nodejs22.x"
  filename         = data.archive_file.worker.output_path
  source_code_hash = data.archive_file.worker.output_base64sha256
  memory_size      = var.lambda_memory_mb

  environment {
    variables = {
      TABLE_NAME  = aws_dynamodb_table.jobs.name
      BUCKET_NAME = aws_s3_bucket.batch.id
      QUEUE_URL   = aws_sqs_queue.main.url
    }
  }

  tags = local.tags
}

resource "aws_lambda_event_source_mapping" "sqs" {
  event_source_arn = aws_sqs_queue.main.arn
  function_name    = aws_lambda_function.worker.arn
  batch_size       = var.sqs_batch_size
}
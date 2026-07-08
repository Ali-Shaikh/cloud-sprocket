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

# --- SQS queue that will receive S3 events ------------------------------------
resource "aws_sqs_queue" "events" {
  name = "${local.name}-s3-events"
  tags = local.tags
}

# Policy allowing S3 to send messages to the queue (required for notifications)
resource "aws_sqs_queue_policy" "allow_s3" {
  queue_url = aws_sqs_queue.events.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect    = "Allow"
        Principal = { Service = "s3.amazonaws.com" }
        Action    = "sqs:SendMessage"
        Resource  = aws_sqs_queue.events.arn
        Condition = {
          ArnEquals = {
            "aws:SourceArn" = aws_s3_bucket.events.arn
          }
        }
      }
    ]
  })
}

# --- S3 bucket with event notification to the queue ---------------------------
resource "aws_s3_bucket" "events" {
  bucket = "${local.name}-events"
  tags   = local.tags
}

resource "aws_s3_bucket_public_access_block" "events" {
  bucket = aws_s3_bucket.events.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_notification" "events" {
  bucket = aws_s3_bucket.events.id

  queue {
    queue_arn = aws_sqs_queue.events.arn
    events    = ["s3:ObjectCreated:*"]
  }

  depends_on = [aws_sqs_queue_policy.allow_s3]
}

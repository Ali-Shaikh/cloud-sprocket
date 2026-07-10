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

# --- SQS target for events ----------------------------------------------------
resource "aws_sqs_queue" "target" {
  name = "${local.name}-eb-target"
  tags = local.tags
}

# --- Custom EventBridge bus + rule + SQS target -------------------------------
resource "aws_cloudwatch_event_bus" "lab" {
  name = "${local.name}-bus"
  tags = local.tags
}

resource "aws_cloudwatch_event_rule" "lab" {
  name           = "${local.name}-rule"
  event_bus_name = aws_cloudwatch_event_bus.lab.name

  event_pattern = jsonencode({
    source = ["lab.events"]
  })

  tags = local.tags
}

resource "aws_cloudwatch_event_target" "sqs" {
  rule           = aws_cloudwatch_event_rule.lab.name
  event_bus_name = aws_cloudwatch_event_bus.lab.name
  target_id      = "sqsTarget"
  arn            = aws_sqs_queue.target.arn
}

# Policy allowing EventBridge to deliver to SQS (condition uses rule ARN)
resource "aws_sqs_queue_policy" "allow_eb" {
  queue_url = aws_sqs_queue.target.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect    = "Allow"
        Principal = { Service = "events.amazonaws.com" }
        Action    = "sqs:SendMessage"
        Resource  = aws_sqs_queue.target.arn
        Condition = {
          ArnEquals = {
            "aws:SourceArn" = aws_cloudwatch_event_rule.lab.arn
          }
        }
      }
    ]
  })

  depends_on = [aws_cloudwatch_event_rule.lab]
}

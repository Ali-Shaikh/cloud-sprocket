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

resource "aws_sns_topic" "lab" {
  name = "${local.name}-fanout"
  tags = local.tags
}

resource "aws_sqs_queue" "high" {
  name = "${local.name}-high"
  tags = local.tags
}

resource "aws_sqs_queue" "low" {
  name = "${local.name}-low"
  tags = local.tags
}

resource "aws_sns_topic_subscription" "high" {
  topic_arn = aws_sns_topic.lab.arn
  protocol  = "sqs"
  endpoint  = aws_sqs_queue.high.arn

  filter_policy = jsonencode({
    level = ["high"]
  })
}

resource "aws_sns_topic_subscription" "low" {
  topic_arn = aws_sns_topic.lab.arn
  protocol  = "sqs"
  endpoint  = aws_sqs_queue.low.arn

  filter_policy = jsonencode({
    level = ["low"]
  })
}

resource "aws_sqs_queue_policy" "high" {
  queue_url = aws_sqs_queue.high.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "sns.amazonaws.com" }
      Action    = "sqs:SendMessage"
      Resource  = aws_sqs_queue.high.arn
      Condition = { ArnEquals = { "aws:SourceArn" = aws_sns_topic.lab.arn } }
    }]
  })
}

resource "aws_sqs_queue_policy" "low" {
  queue_url = aws_sqs_queue.low.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "sns.amazonaws.com" }
      Action    = "sqs:SendMessage"
      Resource  = aws_sqs_queue.low.arn
      Condition = { ArnEquals = { "aws:SourceArn" = aws_sns_topic.lab.arn } }
    }]
  })
}

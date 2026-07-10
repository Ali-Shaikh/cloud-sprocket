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

# IAM role for Step Functions to execute (minimal, no tasks call real services here)
resource "aws_iam_role" "sfn" {
  name = "${local.name}-sfn-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "states.amazonaws.com"
        }
        Action = "sts:AssumeRole"
      }
    ]
  })

  tags = local.tags
}

resource "aws_iam_role_policy" "sfn" {
  name = "${local.name}-sfn-policy"
  role = aws_iam_role.sfn.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["lambda:InvokeFunction"]
        Resource = "*"
      }
    ]
  })
}

# Step Functions state machine for a simplified order flow using Pass states.
# In a fuller lab this would call Lambdas/SQS; here it demonstrates orchestration
# definition, start execution, and inspection.
resource "aws_sfn_state_machine" "order_flow" {
  name     = "${local.name}-order-flow"
  role_arn = aws_iam_role.sfn.arn

  definition = jsonencode({
    Comment = "Simplified order processing flow for CloudSprocket lab (Pass states for demo)."
    StartAt = "ReceiveOrder"
    States = {
      ReceiveOrder = {
        Type = "Pass"
        Parameters = {
          "orderId.$" = "$.orderId"
          "status"    = "received"
        }
        Next = "ValidateOrder"
      }
      ValidateOrder = {
        Type = "Pass"
        Parameters = {
          "orderId.$" = "$.orderId"
          "status"    = "validated"
        }
        Next = "ProcessPayment"
      }
      ProcessPayment = {
        Type = "Pass"
        Parameters = {
          "orderId.$" = "$.orderId"
          "status"    = "paid"
        }
        Next = "ShipOrder"
      }
      ShipOrder = {
        Type = "Pass"
        Parameters = {
          "orderId.$" = "$.orderId"
          "status"    = "shipped"
        }
        Next = "NotifyCustomer"
      }
      NotifyCustomer = {
        Type = "Pass"
        Parameters = {
          "orderId.$" = "$.orderId"
          "status"    = "notified"
        }
        End = true
      }
    }
  })

  tags = local.tags
}

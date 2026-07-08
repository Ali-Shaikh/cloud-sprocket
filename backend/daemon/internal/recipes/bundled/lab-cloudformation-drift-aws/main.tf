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

# CloudFormation stack managed by this recipe (tofu). Demonstrates recipe
# provisioning a stack. Contrast with native CF templates or console edits
# that cause drift detectable by the recipe engine (see B1).
resource "aws_cloudformation_stack" "drift_lab" {
  name = "${local.name}-cf-drift-lab"

  template_body = jsonencode({
    AWSTemplateFormatVersion = "2010-09-09"
    Description              = "CloudSprocket lab stack for CF vs recipe drift teaching."
    Resources = {
      LabQueue = {
        Type = "AWS::SQS::Queue"
        Properties = {
          QueueName = "${local.name}-cf-drift-q"
          Tags = [
            for k, v in local.tags : { Key = k, Value = v }
          ]
        }
      }
    }
    Outputs = {
      QueueURL = {
        Description = "URL of the queue inside the stack."
        Value       = { "Fn::GetAtt" = ["LabQueue", "QueueURL"] }
      }
    }
  })

  tags = local.tags
}

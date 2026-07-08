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

# --- Lambda for the API -------------------------------------------------------
data "archive_file" "api" {
  type        = "zip"
  output_path = "${path.module}/.build/api.zip"
  source_dir  = var.backend_source_dir
}

resource "aws_iam_role" "lambda" {
  name = "${local.name}-api-role"

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

resource "aws_lambda_function" "api" {
  function_name    = "${local.name}-api"
  role             = aws_iam_role.lambda.arn
  handler          = "handler.handler"
  runtime          = "nodejs22.x"
  filename         = data.archive_file.api.output_path
  source_code_hash = data.archive_file.api.output_base64sha256
  memory_size      = var.lambda_memory_mb
  tags             = local.tags
}

# --- REST API, deployment, stage ----------------------------------------------
resource "aws_api_gateway_rest_api" "lab" {
  name        = "${local.name}-api"
  description = "Lab REST API with usage plan"
  tags        = local.tags
}

resource "aws_api_gateway_resource" "root" {
  rest_api_id = aws_api_gateway_rest_api.lab.id
  parent_id   = aws_api_gateway_rest_api.lab.root_resource_id
  path_part   = "lab"
}

resource "aws_api_gateway_method" "get" {
  rest_api_id   = aws_api_gateway_rest_api.lab.id
  resource_id   = aws_api_gateway_resource.root.id
  http_method   = "GET"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "lambda" {
  rest_api_id             = aws_api_gateway_rest_api.lab.id
  resource_id             = aws_api_gateway_resource.root.id
  http_method             = aws_api_gateway_method.get.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.api.invoke_arn
}

resource "aws_api_gateway_method_response" "ok" {
  rest_api_id = aws_api_gateway_rest_api.lab.id
  resource_id = aws_api_gateway_resource.root.id
  http_method = aws_api_gateway_method.get.http_method
  status_code = "200"
}

resource "aws_api_gateway_integration_response" "ok" {
  rest_api_id = aws_api_gateway_rest_api.lab.id
  resource_id = aws_api_gateway_resource.root.id
  http_method = aws_api_gateway_method.get.http_method
  status_code = aws_api_gateway_method_response.ok.status_code

  depends_on = [aws_api_gateway_integration.lambda]
}

resource "aws_api_gateway_deployment" "lab" {
  rest_api_id = aws_api_gateway_rest_api.lab.id

  depends_on = [
    aws_api_gateway_integration.lambda,
    aws_api_gateway_integration_response.ok,
  ]

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_api_gateway_stage" "lab" {
  deployment_id = aws_api_gateway_deployment.lab.id
  rest_api_id   = aws_api_gateway_rest_api.lab.id
  stage_name    = var.environment
  tags          = local.tags
}

# --- Usage plan + API key for auth/throttling ---------------------------------
resource "aws_api_gateway_usage_plan" "lab" {
  name = "${local.name}-plan"

  api_stages {
    api_id = aws_api_gateway_rest_api.lab.id
    stage  = aws_api_gateway_stage.lab.stage_name
  }

  throttle_settings {
    burst_limit = 10
    rate_limit  = 5
  }

  quota_settings {
    limit  = 1000
    period = "DAY"
  }

  tags = local.tags
}

resource "aws_api_gateway_api_key" "lab" {
  name  = "${local.name}-key"
  value = "lab-demo-key-12345" # fixed for lab predictability; rotate in real use
  tags  = local.tags
}

resource "aws_api_gateway_usage_plan_key" "lab" {
  key_id        = aws_api_gateway_api_key.lab.id
  key_type      = "API_KEY"
  usage_plan_id = aws_api_gateway_usage_plan.lab.id
}

# Lambda permission for API Gateway
resource "aws_lambda_permission" "apigw" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.api.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.lab.execution_arn}/*/*"
}

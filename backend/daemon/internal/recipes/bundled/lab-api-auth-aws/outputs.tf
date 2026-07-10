output "api_endpoint" {
  description = "Invoke URL for the API stage."
  value       = "https://${aws_api_gateway_rest_api.lab.id}.execute-api.${var.aws_region}.localhost.localstack.cloud/${aws_api_gateway_stage.lab.stage_name}/lab"
  # Note: LocalStack uses this style of URL for invoke; real AWS differs but pattern holds.
}

output "api_key_value" {
  description = "Value of the API key associated with the usage plan (use as x-api-key header)."
  value       = aws_api_gateway_api_key.lab.value
  sensitive   = true
}

output "usage_plan_id" {
  description = "ID of the usage plan."
  value       = aws_api_gateway_usage_plan.lab.id
}

output "lambda_function_name" {
  description = "Name of the backing Lambda function."
  value       = aws_lambda_function.api.function_name
}

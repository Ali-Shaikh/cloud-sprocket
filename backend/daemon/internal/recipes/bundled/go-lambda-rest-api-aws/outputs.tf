output "api_endpoint" {
  description = "HTTP API invoke URL."
  value       = aws_apigatewayv2_api.http.api_endpoint
}

output "lambda_function_name" {
  description = "Go Lambda function name."
  value       = aws_lambda_function.api.function_name
}

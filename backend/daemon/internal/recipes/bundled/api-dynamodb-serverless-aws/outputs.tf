output "api_endpoint" {
  description = "Base URL of the backend HTTP API."
  value       = aws_apigatewayv2_api.http.api_endpoint
}

output "dynamodb_table" {
  description = "DynamoDB table backing the application."
  value       = aws_dynamodb_table.data.name
}
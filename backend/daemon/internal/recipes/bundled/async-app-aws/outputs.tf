output "api_endpoint" {
  description = "Base URL of the HTTP API."
  value       = aws_apigatewayv2_api.http.api_endpoint
}

output "queue_url" {
  description = "URL of the main SQS queue."
  value       = aws_sqs_queue.main.url
}

output "frontend_website_endpoint" {
  description = "Static website endpoint for the frontend."
  value       = aws_s3_bucket_website_configuration.frontend.website_endpoint
}

output "dynamodb_table" {
  description = "DynamoDB table available to the worker."
  value       = aws_dynamodb_table.data.name
}
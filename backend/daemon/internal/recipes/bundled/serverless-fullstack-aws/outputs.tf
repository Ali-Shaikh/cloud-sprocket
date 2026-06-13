output "frontend_bucket" {
  description = "S3 bucket hosting the static frontend."
  value       = aws_s3_bucket.frontend.bucket
}

output "frontend_website_endpoint" {
  description = "Static website endpoint for the frontend."
  value       = aws_s3_bucket_website_configuration.frontend.website_endpoint
}

output "api_endpoint" {
  description = "Base URL of the backend HTTP API."
  value       = aws_apigatewayv2_api.http.api_endpoint
}

output "dynamodb_table" {
  description = "DynamoDB table backing the application."
  value       = aws_dynamodb_table.data.name
}

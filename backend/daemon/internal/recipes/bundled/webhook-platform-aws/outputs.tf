output "ingest_endpoint" {
  description = "URL to POST webhook payloads."
  value       = "${aws_apigatewayv2_api.http.api_endpoint}/webhook"
}

output "queue_url" {
  description = "URL of the main SQS queue."
  value       = aws_sqs_queue.main.url
}

output "dynamodb_table" {
  description = "DynamoDB table storing processed webhook payloads."
  value       = aws_dynamodb_table.payloads.name
}
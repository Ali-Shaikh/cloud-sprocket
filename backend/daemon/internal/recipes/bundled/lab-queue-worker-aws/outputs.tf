output "queue_url" {
  description = "URL of the main SQS queue."
  value       = aws_sqs_queue.main.url
}

output "lambda_function_name" {
  description = "Name of the queue worker Lambda."
  value       = aws_lambda_function.worker.function_name
}
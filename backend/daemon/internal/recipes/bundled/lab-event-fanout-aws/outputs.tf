output "topic_arn" {
  value = aws_sns_topic.events.arn
}

output "queue_url" {
  value = aws_sqs_queue.events.url
}

output "lambda_function_name" {
  value = aws_lambda_function.worker.function_name
}
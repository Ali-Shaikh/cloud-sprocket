output "sns_topic_arn" {
  description = "ARN of the SNS topic."
  value       = aws_sns_topic.main.arn
}

output "lambda_function_name" {
  description = "Subscriber Lambda name."
  value       = aws_lambda_function.subscriber.function_name
}

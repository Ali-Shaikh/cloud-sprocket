output "lambda_function_name" {
  description = "Name of the EventBridge triggered Lambda."
  value       = aws_lambda_function.processor.function_name
}

output "event_rule_name" {
  description = "Name of the EventBridge rule."
  value       = aws_cloudwatch_event_rule.processor.name
}

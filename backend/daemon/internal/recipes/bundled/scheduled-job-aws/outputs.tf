output "lambda_function_name" {
  description = "Name of the scheduled job Lambda."
  value       = aws_lambda_function.job.function_name
}

output "schedule_rule_name" {
  description = "Name of the EventBridge rule driving the schedule."
  value       = aws_cloudwatch_event_rule.schedule.name
}

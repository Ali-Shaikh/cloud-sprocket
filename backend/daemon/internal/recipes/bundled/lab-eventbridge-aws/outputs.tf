output "event_bus_name" {
  description = "Name of the custom EventBridge bus."
  value       = aws_cloudwatch_event_bus.lab.name
}

output "rule_name" {
  description = "Name of the EventBridge rule."
  value       = aws_cloudwatch_event_rule.lab.name
}

output "queue_url" {
  description = "URL of the SQS queue used as event target."
  value       = aws_sqs_queue.target.url
}

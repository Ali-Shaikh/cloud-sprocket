output "topic_arn" {
  description = "ARN of the SNS topic."
  value       = aws_sns_topic.lab.arn
}

output "queue_high_url" {
  description = "URL of the high priority SQS queue."
  value       = aws_sqs_queue.high.url
}

output "queue_low_url" {
  description = "URL of the low priority SQS queue."
  value       = aws_sqs_queue.low.url
}

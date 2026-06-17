output "queue_url" {
  description = "URL of the main SQS queue. Send batch job payloads here."
  value       = aws_sqs_queue.main.url
}

output "dlq_url" {
  description = "URL of the dead-letter queue for failed messages."
  value       = aws_sqs_queue.dlq.url
}

output "batch_bucket" {
  description = "Private S3 bucket for batch input and output objects."
  value       = aws_s3_bucket.batch.id
}

output "dynamodb_table" {
  description = "DynamoDB table for job status records."
  value       = aws_dynamodb_table.jobs.name
}
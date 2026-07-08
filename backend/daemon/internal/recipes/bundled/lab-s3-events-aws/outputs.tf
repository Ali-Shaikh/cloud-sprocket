output "bucket_name" {
  description = "Name of the S3 bucket emitting events."
  value       = aws_s3_bucket.events.id
}

output "queue_url" {
  description = "URL of the SQS queue receiving S3 notifications."
  value       = aws_sqs_queue.events.url
}

output "bucket_name" {
  description = "Name of the S3 bucket."
  value       = aws_s3_bucket.events.id
}

output "lambda_function_name" {
  description = "Name of the S3-triggered Lambda."
  value       = aws_lambda_function.events.function_name
}

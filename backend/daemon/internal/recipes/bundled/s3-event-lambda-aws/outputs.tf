output "bucket_name" {
  description = "Name of the S3 bucket that triggers events."
  value       = aws_s3_bucket.uploads.bucket
}

output "lambda_function_name" {
  description = "Name of the S3 event processor Lambda."
  value       = aws_lambda_function.processor.function_name
}

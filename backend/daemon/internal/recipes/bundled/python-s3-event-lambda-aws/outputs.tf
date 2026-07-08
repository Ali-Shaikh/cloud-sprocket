output "bucket_name" {
  description = "S3 uploads bucket."
  value       = aws_s3_bucket.uploads.bucket
}

output "lambda_function_name" {
  description = "Python processor Lambda."
  value       = aws_lambda_function.processor.function_name
}

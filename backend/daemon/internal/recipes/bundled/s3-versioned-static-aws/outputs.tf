output "bucket_name" {
  description = "Versioned S3 bucket."
  value       = aws_s3_bucket.site.bucket
}

output "website_endpoint" {
  description = "Website endpoint."
  value       = aws_s3_bucket_website_configuration.site.website_endpoint
}

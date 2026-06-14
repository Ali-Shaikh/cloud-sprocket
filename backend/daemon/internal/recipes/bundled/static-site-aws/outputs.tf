output "bucket_name" {
  description = "S3 bucket hosting the static website."
  value       = aws_s3_bucket.site.bucket
}

output "website_endpoint" {
  description = "Static website endpoint for the site."
  value       = aws_s3_bucket_website_configuration.site.website_endpoint
}

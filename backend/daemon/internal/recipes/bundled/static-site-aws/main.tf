terraform {
  required_version = ">= 1.6.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
}

locals {
  name = "${var.app_name}-${var.environment}"
  tags = merge({
    App         = var.app_name
    Environment = var.environment
    ManagedBy   = "CloudSprocket"
  }, var.tags)
}

# --- Static website bucket ----------------------------------------------------
resource "aws_s3_bucket" "site" {
  bucket = "${local.name}-site"
  tags   = local.tags
}

resource "aws_s3_bucket_website_configuration" "site" {
  bucket = aws_s3_bucket.site.id

  index_document {
    suffix = "index.html"
  }

  error_document {
    key = "index.html"
  }
}

locals {
  # MIME types for the common static-site file extensions.
  content_types = {
    html  = "text/html"
    css   = "text/css"
    js    = "application/javascript"
    json  = "application/json"
    svg   = "image/svg+xml"
    png   = "image/png"
    jpg   = "image/jpeg"
    ico   = "image/x-icon"
    txt   = "text/plain"
    map   = "application/json"
    woff  = "font/woff"
    woff2 = "font/woff2"
  }
  site_files = var.frontend_dist_dir == "" ? toset([]) : fileset(var.frontend_dist_dir, "**/*.*")
}

# Upload the built static site (when a dist dir is provided).
resource "aws_s3_object" "site" {
  for_each = local.site_files

  bucket       = aws_s3_bucket.site.id
  key          = each.value
  source       = "${var.frontend_dist_dir}/${each.value}"
  etag         = filemd5("${var.frontend_dist_dir}/${each.value}")
  content_type = lookup(local.content_types, lower(reverse(split(".", each.value))[0]), "application/octet-stream")
}

variable "app_name" {
  type        = string
  description = "Lowercase name prefix used for every resource."
  default     = "myapp"
}

variable "environment" {
  type        = string
  description = "Deployment environment."
  default     = "dev"
}

variable "aws_region" {
  type        = string
  description = "AWS region to deploy into."
  default     = "us-east-1"
}

variable "container_image" {
  type        = string
  description = "Container image for the backend service."
  default     = "public.ecr.aws/docker/library/node:20-alpine"
}

variable "container_port" {
  type        = number
  description = "Port the backend container listens on."
  default     = 3000
}

variable "desired_count" {
  type        = number
  description = "Number of Fargate tasks to run."
  default     = 2
}

variable "db_username" {
  type        = string
  description = "Master username for the Postgres database."
  default     = "appuser"
}

variable "db_password" {
  type        = string
  description = "Master password for the Postgres database."
  sensitive   = true
  default     = "changeme-please"
}

variable "db_instance_class" {
  type        = string
  description = "RDS instance class."
  default     = "db.t3.micro"
}

variable "frontend_dist_dir" {
  type        = string
  description = "Directory of your built static frontend. Leave blank to create an empty bucket."
  default     = ""
}

variable "tags" {
  type        = map(string)
  description = "Extra tags applied to every resource."
  default     = {}
}

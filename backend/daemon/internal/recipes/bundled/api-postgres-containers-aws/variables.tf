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
  description = "Container image for the backend service. The default nginx image serves HTTP successfully for a first deployment."
  default     = "public.ecr.aws/docker/library/nginx:stable-alpine"
}

variable "container_port" {
  type        = number
  description = "Port the backend container listens on."
  default     = 80
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

variable "tags" {
  type        = map(string)
  description = "Extra tags applied to every resource."
  default     = {}
}
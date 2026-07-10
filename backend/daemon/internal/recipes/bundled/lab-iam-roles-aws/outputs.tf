output "role_name" {
  description = "Name of the IAM role."
  value       = aws_iam_role.lab.name
}

output "role_arn" {
  description = "ARN of the IAM role."
  value       = aws_iam_role.lab.arn
}

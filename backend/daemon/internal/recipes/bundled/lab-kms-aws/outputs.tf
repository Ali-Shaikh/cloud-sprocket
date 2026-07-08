output "key_id" {
  description = "ID of the KMS key."
  value       = aws_kms_key.lab.key_id
}

output "key_arn" {
  description = "ARN of the KMS key."
  value       = aws_kms_key.lab.arn
}

output "alias_name" {
  description = "Alias name (without alias/ prefix in some contexts)."
  value       = aws_kms_alias.lab.name
}

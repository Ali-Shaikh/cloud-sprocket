output "secret_arn" {
  value = aws_secretsmanager_secret.main.arn
}

output "secret_name" {
  value = aws_secretsmanager_secret.main.name
}
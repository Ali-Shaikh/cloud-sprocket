output "secret_arn" {
  description = "ARN of the managed secret."
  value       = aws_secretsmanager_secret.app.arn
}

output "lambda_function_name" {
  description = "Lambda with secret access."
  value       = aws_lambda_function.fn.function_name
}

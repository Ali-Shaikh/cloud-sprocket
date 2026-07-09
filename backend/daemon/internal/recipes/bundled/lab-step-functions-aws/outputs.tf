output "state_machine_name" {
  description = "Name of the Step Functions state machine."
  value       = aws_sfn_state_machine.order_flow.name
}

output "state_machine_arn" {
  description = "ARN of the Step Functions state machine (primary)."
  value       = aws_sfn_state_machine.order_flow.arn
}

output "role_name" {
  description = "IAM role used by the state machine."
  value       = aws_iam_role.sfn.name
}

output "stack_name" {
  description = "Name of the CloudFormation stack created by the recipe (tofu)."
  value       = aws_cloudformation_stack.drift_lab.name
}

output "stack_id" {
  description = "ID (ARN) of the CloudFormation stack."
  value       = aws_cloudformation_stack.drift_lab.id
}

output "queue_url_from_stack" {
  description = "Queue URL exposed via the stack outputs (for reference in drift teaching)."
  value       = try(aws_cloudformation_stack.drift_lab.outputs["QueueURL"], "")
}

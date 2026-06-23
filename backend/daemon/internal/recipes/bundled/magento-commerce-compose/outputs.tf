output "storefront_url" {
  description = "Local Magento storefront URL served by Docker Compose."
  value       = var.magento_base_url
}

output "compose_project" {
  description = "Logical Compose project name recorded for this deployment."
  value       = local.name
}
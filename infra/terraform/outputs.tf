output "cloudfront_url" {
  description = "Public HTTPS URL of the frontend — hit this."
  value       = "https://${aws_cloudfront_distribution.frontend.domain_name}"
}

# Publish the CloudFront URL to SSM so downstream stacks (e.g. Streamlit) can
# read it without cross-stack remote_state. Follows the same decoupled pattern
# used for session_secret and redis_password in data.tf.
resource "aws_ssm_parameter" "cloudfront_url" {
  name        = "/${var.project}/frontend/cloudfront_url"
  type        = "String"
  value       = "https://${aws_cloudfront_distribution.frontend.domain_name}"
  description = "Frontend CloudFront URL — consumed by the Streamlit stack as BFF_BASE_URL / FRONTEND_ORIGIN."

  lifecycle {
    # The domain never changes once the distribution is created.
    ignore_changes = [value]
  }
}

output "alb_dns_name" {
  description = "ALB origin hostname. Direct access is blocked (403) — go through cloudfront_url."
  value       = aws_lb.frontend.dns_name
}

output "ecs_cluster" {
  description = "Shared cluster the service runs in — set as ECS_CLUSTER in the deploy pipeline."
  value       = data.aws_ecs_cluster.main.cluster_name
}

output "ecs_service" {
  description = "Frontend service name — set as ECS_SERVICE in the deploy pipeline."
  value       = aws_ecs_service.app.name
}

output "ecr_repository_url" {
  description = "ECR repo the pipeline pushes images to (created by the overview stack)."
  value       = data.aws_ecr_repository.frontend.repository_url
}

output "task_family" {
  description = "Task definition family the pipeline registers new revisions under."
  value       = aws_ecs_task_definition.app.family
}

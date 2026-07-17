output "cloudfront_url" {
  description = "Public HTTPS URL of the frontend — hit this."
  value       = "https://${aws_cloudfront_distribution.frontend.domain_name}"
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

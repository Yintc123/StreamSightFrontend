locals {
  app = "${var.project}-frontend"

  # CSRF origins: the CloudFront URL is always allowed; append any custom
  # domains. config.ts requires a non-localhost origin in production.
  allowed_origins = join(",", concat(
    ["https://${aws_cloudfront_distribution.frontend.domain_name}"],
    var.extra_allowed_origins,
  ))
}

resource "aws_cloudwatch_log_group" "app" {
  name              = "/ecs/${local.app}"
  retention_in_days = 7
}

resource "aws_ecs_task_definition" "app" {
  family                   = local.app
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.task_cpu
  memory                   = var.task_memory
  execution_role_arn       = data.aws_iam_role.execution.arn
  task_role_arn            = data.aws_iam_role.task.arn

  runtime_platform {
    cpu_architecture        = "X86_64"
    operating_system_family = "LINUX"
  }

  container_definitions = jsonencode([{
    name      = local.app
    image     = "${data.aws_ecr_repository.frontend.repository_url}:${var.image_tag}"
    essential = true

    portMappings = [{
      containerPort = var.container_port
      protocol      = "tcp"
    }]

    # Non-secret config. Secrets (SESSION_SECRET, REDIS_PASSWORD) come from SSM
    # below; NEXT_PUBLIC_* + build metadata are baked into the image at build.
    environment = [
      { name = "NODE_ENV", value = "production" },
      { name = "PORT", value = tostring(var.container_port) },
      { name = "HOSTNAME", value = "0.0.0.0" },
      { name = "NEXT_TELEMETRY_DISABLED", value = "1" },

      { name = "USE_MOCK", value = var.use_mock },
      { name = "BACKEND_API_URL", value = var.backend_api_url },

      { name = "SESSION_COOKIE_NAME",   value = var.session_cookie_name },
      { name = "SESSION_COOKIE_DOMAIN", value = var.session_cookie_domain },
      { name = "SESSION_TTL_SECONDS",   value = tostring(var.session_ttl_seconds) },

      { name = "REDIS_HOST", value = data.aws_instance.datastore.private_ip },
      { name = "REDIS_PORT", value = "6379" },
      { name = "REDIS_KEY_PREFIX", value = var.redis_key_prefix },
      { name = "REDIS_TLS_ENABLED", value = "0" }, # in-VPC, plaintext
      { name = "REDIS_CONNECT_TIMEOUT_MS", value = "2000" },
      { name = "REDIS_COMMAND_TIMEOUT_MS", value = "1000" },

      { name = "ALLOWED_ORIGINS", value = local.allowed_origins },
      { name = "NEXT_PUBLIC_APP_NAME", value = var.app_name },
    ]

    secrets = concat(
      [
        { name = "SESSION_SECRET", valueFrom = data.aws_ssm_parameter.session_secret.arn },
        { name = "REDIS_PASSWORD", valueFrom = data.aws_ssm_parameter.redis_password.arn },
      ],
      var.use_session_secret_previous ? [
        { name = "SESSION_SECRET_PREVIOUS", valueFrom = data.aws_ssm_parameter.session_secret_previous[0].arn },
      ] : [],
    )

    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = aws_cloudwatch_log_group.app.name
        "awslogs-region"        = var.region
        "awslogs-stream-prefix" = "app"
      }
    }
  }])
}

resource "aws_ecs_service" "app" {
  name            = local.app
  cluster         = data.aws_ecs_cluster.main.arn
  task_definition = aws_ecs_task_definition.app.arn
  desired_count   = var.desired_count

  # Fargate Spot (~70% cheaper). A reclaimed task is rescheduled with a short
  # gap; fine for a stateless BFF. Switch to FARGATE for zero interruption.
  capacity_provider_strategy {
    capacity_provider = "FARGATE_SPOT"
    weight            = 1
  }

  network_configuration {
    subnets = data.aws_subnets.default.ids
    # Own SG (ALB -> 3000) + the shared ECS SG so the datastore accepts Redis.
    security_groups  = [aws_security_group.ecs.id, data.aws_security_group.shared_ecs.id]
    assign_public_ip = true # required to pull from ECR in the default VPC (no NAT)
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.frontend.arn
    container_name   = local.app
    container_port   = var.container_port
  }

  health_check_grace_period_seconds = 60

  depends_on = [aws_lb_listener.http]

  # The app pipeline updates task_definition (new image) and may scale
  # desired_count; don't let `terraform apply` revert those.
  lifecycle {
    ignore_changes = [task_definition, desired_count]
  }
}

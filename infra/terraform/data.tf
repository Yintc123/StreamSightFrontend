# The account's default VPC + subnets — the same network the overview stack
# (cluster, datastore EC2) runs in, so the frontend tasks can reach Redis.
data "aws_vpc" "default" {
  default = true
}

data "aws_subnets" "default" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.default.id]
  }
}

# CloudFront edge IP ranges — used to lock the ALB so only CloudFront reaches it.
data "aws_ec2_managed_prefix_list" "cloudfront" {
  name = "com.amazonaws.global.cloudfront.origin-facing"
}

# =====================================================================
# Shared resources created by the overview stack. Referenced here by their
# well-known names/tags (the decoupled multi-repo pattern — no cross-stack
# remote_state). All of these must already exist; apply the overview stack
# first. Notably `/streamsight/frontend/session_secret` only exists once
# `session_secret` was set in the overview's tfvars.
# =====================================================================

# ECS cluster ("streamsight"), shared by all apps.
data "aws_ecs_cluster" "main" {
  cluster_name = var.project
}

# Per-app ECR repo + IAM roles the overview stack provisioned for the frontend.
data "aws_ecr_repository" "frontend" {
  name = "${var.project}-frontend"
}

data "aws_iam_role" "execution" {
  # Reads /streamsight/shared/* + /streamsight/frontend/* (least privilege).
  name = "${var.project}-frontend-execution"
}

data "aws_iam_role" "task" {
  # Shared task role — what the running container may call (nothing extra yet).
  name = "${var.project}-ecs-task"
}

# Secrets injected into the task (only ARNs are used; values stay in SSM).
data "aws_ssm_parameter" "redis_password" {
  name = "/${var.project}/shared/redis_password"
}

data "aws_ssm_parameter" "session_secret" {
  name = "/${var.project}/frontend/session_secret"
}

# Only fetched during a SESSION_SECRET rotation window (use_session_secret_previous = true).
# Create /streamsight/frontend/session_secret_previous in SSM before flipping the flag;
# the overview stack does not provision this parameter by default.
data "aws_ssm_parameter" "session_secret_previous" {
  count = var.use_session_secret_previous ? 1 : 0
  name  = "/${var.project}/frontend/session_secret_previous"
}

# Datastore EC2 (MariaDB + Redis) — the BFF session store lives on its Redis.
data "aws_instance" "datastore" {
  filter {
    name   = "tag:Name"
    values = ["${var.project}-datastore"]
  }
  filter {
    name   = "instance-state-name"
    values = ["running"]
  }
}

# The overview's ECS task security group. The datastore SG only accepts Redis
# from members of THIS group, so the frontend service joins it (in addition to
# its own SG) to reach Redis — no rule change needed on the overview stack.
data "aws_security_group" "shared_ecs" {
  filter {
    name   = "tag:Name"
    values = ["${var.project}-ecs"]
  }
  vpc_id = data.aws_vpc.default.id
}

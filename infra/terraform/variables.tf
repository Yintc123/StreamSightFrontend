# =====================================================================
# The frontend stack completes the "per-app" model started in the overview
# repo's Terraform: that stack creates the shared foundation (ECS cluster,
# datastore EC2 with Redis, SSM secrets) and, for the frontend, an ECR repo +
# OIDC deploy role + execution role. This stack adds the frontend's public
# path (CloudFront -> ALB -> Fargate) and consumes the shared pieces via data
# sources. Keep `region` and `project` identical to the overview stack.
# =====================================================================

variable "region" {
  description = "AWS region. MUST match the overview stack — this stack reuses its VPC, cluster and datastore."
  type        = string
  default     = "ap-northeast-2"
}

variable "project" {
  description = "Name prefix shared with the overview stack. Used to look up shared resources (cluster \"streamsight\", ECR \"streamsight-frontend\", SSM \"/streamsight/...\")."
  type        = string
  default     = "streamsight"
}

variable "github_repo" {
  description = "owner/name of the GitHub repo allowed to assume the Terraform CI role via OIDC."
  type        = string
  default     = "Yintc123/StreamSightFrontend"
}

variable "deploy_branch" {
  description = "Only OIDC tokens from this branch may assume the Terraform CI role."
  type        = string
  default     = "main"
}

variable "container_port" {
  description = "Port the Next.js standalone server listens on (Dockerfile EXPOSE / PORT)."
  type        = number
  default     = 3000
}

variable "cloudfront_price_class" {
  description = "CloudFront edge coverage. PriceClass_200 includes Asia; _100 is US/EU only (cheapest)."
  type        = string
  default     = "PriceClass_200"
}

variable "image_tag" {
  description = "ECR image tag used at bootstrap. The app pipeline overrides this on each deploy."
  type        = string
  default     = "latest"
}

# ---- ECS service sizing ----
# Next.js SSR is heavier than the Go API; default higher than the overview's
# 256/512 (matches the app's original .aws/task-definition.json).

variable "desired_count" {
  type    = number
  default = 1
}

variable "task_cpu" {
  type    = number
  default = 512
}

variable "task_memory" {
  type    = number
  default = 1024
}

# ---- Frontend app config (non-secret; secrets come from SSM) ----

variable "use_mock" {
  description = "USE_MOCK env. '0' hits the real backend (requires backend_api_url); '1' serves mock data with no backend."
  type        = string
  default     = "0"

  validation {
    condition     = contains(["0", "1"], var.use_mock)
    error_message = "use_mock must be \"0\" or \"1\"."
  }
}

variable "backend_api_url" {
  description = "BACKEND_API_URL the BFF calls. REQUIRED when use_mock = \"0\" (config.ts fails fast at boot otherwise). Use the backend's public/CloudFront URL once it deploys."
  type        = string
  default     = ""

  validation {
    condition     = var.use_mock == "1" || var.backend_api_url != ""
    error_message = "backend_api_url is required when use_mock = \"0\"."
  }
}

variable "session_cookie_name" {
  type    = string
  default = "streamsight_session"
}

variable "session_ttl_seconds" {
  description = "Session cookie / store TTL. 30d, aligned with the refresh-token lifetime."
  type        = number
  default     = 2592000
}

variable "redis_key_prefix" {
  description = "REDIS_KEY_PREFIX — namespaces the frontend's keys in the shared Redis so apps don't collide."
  type        = string
  default     = "streamsight-bff-prod"
}

variable "app_name" {
  description = "NEXT_PUBLIC_APP_NAME (inlined into the client bundle at build time; set here for parity)."
  type        = string
  default     = "StreamSight"
}

variable "extra_allowed_origins" {
  description = "Additional CSRF origins appended to the CloudFront URL, e.g. a custom domain [\"https://app.example.com\"]."
  type        = list(string)
  default     = []
}

# Secret header CloudFront attaches to every origin request. The ALB listener
# only forwards requests carrying it, so nobody can bypass CloudFront and hit
# the ALB directly (defense-in-depth on top of the SG prefix-list lock).
resource "random_password" "origin_verify" {
  length  = 32
  special = false
}

# AWS-managed policies.
# SSR/API responses: don't cache, forward everything except Host (so the ALB
# sees its own host). Static assets: cache aggressively, forward nothing.
data "aws_cloudfront_cache_policy" "caching_disabled" {
  name = "Managed-CachingDisabled"
}

data "aws_cloudfront_cache_policy" "caching_optimized" {
  name = "Managed-CachingOptimized"
}

data "aws_cloudfront_origin_request_policy" "all_viewer_except_host" {
  name = "Managed-AllViewerExceptHostHeader"
}

resource "aws_cloudfront_distribution" "frontend" {
  enabled         = true
  comment         = "${var.project} frontend"
  price_class     = var.cloudfront_price_class
  http_version    = "http2and3"
  is_ipv6_enabled = true

  origin {
    origin_id   = "alb"
    domain_name = aws_lb.frontend.dns_name

    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "http-only" # ALB has no cert/domain, so HTTP
      origin_ssl_protocols   = ["TLSv1.2"]
    }

    custom_header {
      name  = "X-Origin-Verify"
      value = random_password.origin_verify.result
    }
  }

  # Default: dynamic SSR + BFF API routes (cookies/auth) — never cache.
  default_cache_behavior {
    target_origin_id       = "alb"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
    cached_methods         = ["GET", "HEAD"]

    cache_policy_id          = data.aws_cloudfront_cache_policy.caching_disabled.id
    origin_request_policy_id = data.aws_cloudfront_origin_request_policy.all_viewer_except_host.id
  }

  # Next.js build assets are content-hashed + immutable — cache them at the edge
  # (no cookies forwarded) to offload the origin. Served from .next/static.
  ordered_cache_behavior {
    path_pattern           = "/_next/static/*"
    target_origin_id       = "alb"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]

    cache_policy_id = data.aws_cloudfront_cache_policy.caching_optimized.id
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  # Free HTTPS on the default *.cloudfront.net domain. For a custom domain, add
  # an ACM cert in us-east-1, set it here + `aliases`, and add a DNS record.
  viewer_certificate {
    cloudfront_default_certificate = true
  }
}

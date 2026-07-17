# =====================================================================
# GitHub Actions OIDC role for THIS stack's Terraform CI (terraform.yml).
#
# The overview stack's `streamsight-github-terraform` role trusts only the
# overview repo, and the per-app `streamsight-frontend-deploy` role can only
# push ECR + roll out ECS — neither can manage this stack's ALB / CloudFront /
# SGs. So the frontend stack owns its own Terraform CI role, trusted by the
# frontend repo. Same bootstrap shape as the overview: the FIRST apply is local
# (creates this role), then CI assumes it via `secrets.TF_ROLE_ARN`.
# =====================================================================

# The GitHub Actions OIDC provider is account-global (one per account) and
# already exists — reference it, don't manage it (the overview stack shares it).
data "aws_iam_openid_connect_provider" "github" {
  url = "https://token.actions.githubusercontent.com"
}

data "aws_iam_policy_document" "terraform_ci_assume" {
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]
    principals {
      type        = "Federated"
      identifiers = [data.aws_iam_openid_connect_provider.github.arn]
    }
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }
    condition {
      test     = "StringLike"
      variable = "token.actions.githubusercontent.com:sub"
      # Same immutable-ID subject format as the overview roles: the @* anchors
      # absorb the owner/repo IDs while pinning the exact owner/repo + branch.
      values = ["repo:${replace(var.github_repo, "/", "@*/")}@*:ref:refs/heads/${var.deploy_branch}"]
    }
  }
}

# AdministratorAccess keeps the bootstrap simple (mirrors the overview's
# github_terraform role). This stack manages ALB/CloudFront/ECS/SGs and must
# PassRole the shared execution/task roles + read shared SSM — tighten later.
resource "aws_iam_role" "terraform_ci" {
  name               = "${var.project}-frontend-terraform"
  assume_role_policy = data.aws_iam_policy_document.terraform_ci_assume.json
}

resource "aws_iam_role_policy_attachment" "terraform_ci_admin" {
  role       = aws_iam_role.terraform_ci.name
  policy_arn = "arn:aws:iam::aws:policy/AdministratorAccess"
}

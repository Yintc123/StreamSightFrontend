# StreamSight Frontend — Terraform deployment

Deploys the Next.js frontend (BFF) to the **shared** StreamSight infrastructure
created by the overview repo's Terraform:

```
Internet ──HTTPS──► CloudFront ──HTTP+secret header──► ALB ──► ECS Fargate (Next.js) ──► EC2 Redis (shared)
                    *.cloudfront.net    CF edge IPs only         only frontend ALB SG      BFF session store
```

This stack is the **per-app completion** of the overview design. The overview
stack builds the shared foundation (ECS cluster, datastore EC2 with Redis, SSM
secrets) and, for the frontend, an **ECR repo**, an **OIDC deploy role**, and an
**ECS execution role**. This stack adds the frontend's own public path —
CloudFront → ALB → the Fargate **service + task definition** — and consumes the
shared pieces via data sources (no cross-stack remote state; they're looked up
by their well-known names/tags).

Same cost-tuning as the overview: Fargate **Spot**, **CachingDisabled** for SSR
with an **edge cache** for `/_next/static/*`, **7-day** logs. The ALB (~$18/mo)
is the fixed floor. Free HTTPS on the default `*.cloudfront.net` domain.

## Prerequisites (apply the overview stack first)

**No local bootstrap is needed for this repo.** The overview stack is the single
admin bootstrap — it owns all the cross-repo IAM/OIDC, including this stack's
Terraform CI role. Once it's applied, this stack runs entirely through CI.

This stack **reads** (and is deployed by roles owned by) the overview stack, which
must have created:

- ECS cluster `streamsight`, datastore EC2 tagged `Name=streamsight-datastore`
  (running), and its ECS SG tagged `Name=streamsight-ecs`.
- ECR repo `streamsight-frontend` + roles `streamsight-frontend-execution` and
  `streamsight-ecs-task`.
- The **Terraform CI role** `streamsight-frontend-terraform` (created by the
  overview's `apps.tf`) — this is what `terraform.yml` assumes.
- SSM params `/streamsight/shared/redis_password` **and**
  `/streamsight/frontend/session_secret`. The latter only exists once
  `session_secret` was set in the overview's `terraform.tfvars` — set it there
  (`openssl rand -base64 48`) if you haven't.

Keep `region` and `project` identical to the overview stack.

## Deploy (via CI — no local Terraform)

The first (and every) apply runs in GitHub Actions. Wire the repo once, then push:

1. From the **overview** stack, grab this app's Terraform CI role ARN and set it
   as this repo's `TF_ROLE_ARN` secret:
   ```bash
   terraform output -json terraform_role_arns   # → use the "frontend" entry
   ```
2. Set repo variables `TF_STATE_BUCKET` (the overview's state bucket) and
   `BACKEND_API_URL` (or `USE_MOCK=1`). See **Terraform CI/CD** below for the
   full list.
3. Push a change under `infra/terraform/**` (or run the workflow manually). The
   `terraform.yml` job `plan`s and `apply`s the whole stack.

> Prefer to apply locally instead? You still can — `terraform init
> -backend-config=backend.hcl && terraform apply` with your own admin
> credentials. It's just not required.

The ECS service can't stabilise until an image exists in ECR. Either let the
`pipeline.yml` workflow build+push (push to `main`), or push one manually:

```bash
REPO=$(terraform output -raw ecr_repository_url)
aws ecr get-login-password --region ap-northeast-2 \
  | docker login --username AWS --password-stdin "$(echo "$REPO" | cut -d/ -f1)"
docker build -t "$REPO:latest" ../..
docker push "$REPO:latest"
```

Get the URL: `terraform output cloudfront_url`
(A new CloudFront distribution takes ~5–15 min to finish deploying.)

## Terraform CI/CD (`.github/workflows/terraform.yml`)

After the bootstrap, infra changes go through CI — same shape as the overview's
`terraform.yml`. Push to `main` (or run it manually) → `init` → `fmt` →
`validate` → `plan`; `apply` runs only on `main`. Trigger paths are
`infra/terraform/**` + the workflow file. Authenticates via OIDC (no AWS keys).

Set these on the repo (Settings → Secrets and variables → Actions):

| kind     | name              | value                                                        |
|----------|-------------------|--------------------------------------------------------------|
| secret   | `TF_ROLE_ARN`     | overview: `terraform output -json terraform_role_arns` → `frontend` |
| variable | `TF_STATE_BUCKET` | the overview stack's S3 state bucket (`streamsight-tfstate-…`)|
| variable | `BACKEND_API_URL` | the backend URL the BFF calls (required unless `USE_MOCK=1`) |
| variable | `USE_MOCK`        | *(optional)* `1` to run without a backend                    |

`session_secret` and `redis_password` are **not** set here — they live in shared
SSM (created by the overview stack) and are read by ARN.

## Wire up the app pipeline (`.github/workflows/pipeline.yml`)

The deploy job builds the image and rolls out this service. Terraform ignores
`task_definition`/`desired_count` on the service, so pipeline deploys won't be
reverted. Point the pipeline at this stack's outputs:

| pipeline env / secret        | value                                                       |
|------------------------------|-------------------------------------------------------------|
| `AWS_REGION`                 | `ap-northeast-2` (match this stack)                         |
| `ECR_REPOSITORY`             | `streamsight-frontend`                                       |
| `ECS_CLUSTER`                | `terraform output -raw ecs_cluster`                        |
| `ECS_SERVICE`                | `terraform output -raw ecs_service`                        |
| `CONTAINER_NAME`             | `streamsight-frontend`                                       |
| `secrets.AWS_DEPLOY_ROLE_ARN`| overview: `terraform output -json deploy_role_arns` → `frontend` |

Because Terraform owns the task definition (it wires SSM secrets + the datastore
IP), the simplest pipeline flow is: build+push the image, then
`aws ecs update-service --force-new-deployment` — no `.aws/task-definition.json`
registration needed. (The task def only changes when you re-`apply` this stack.)

## Day-to-day

- **Change infra** → edit `*.tf`, `terraform plan`/`apply`.
- **Change the app** → push to `main`; `pipeline.yml` builds, pushes, and
  force-deploys a new task. Terraform won't revert it.

## Notes / trade-offs

- **Redis reachability.** The datastore SG only accepts Redis from members of
  the overview's ECS SG. Rather than mutate that stack, the frontend service
  attaches **two** SGs: its own (ALB → 3000) and the shared ECS SG (membership
  grants Redis). For stricter isolation, add a dedicated Redis-only ingress rule
  from the frontend SG instead.
- **Health check** uses `/api/health/live` (always 200 while up), not
  `/api/health` (503 when Redis is down) — so a Redis blip doesn't cycle tasks.
- **CF → ALB is HTTP**, protected by the CF-edge-only SG prefix list + the
  secret `X-Origin-Verify` header. The CF↔origin hop isn't encrypted; for that,
  put a cert/domain on the ALB and switch the origin to `https-only`.
- **Fargate Spot** tasks can be reclaimed (short gap while ECS reschedules). Set
  the service to `FARGATE` for zero interruption at higher cost.
- The `session_secret` is provisioned in the **overview** stack (shared SSM), not
  here — this stack only reads its ARN to inject it into the task.

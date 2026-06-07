# AWS Deployment Guide — V2 Production

## Prerequisites

1. AWS account with admin access
2. GitHub repo secrets configured (see below)
3. ECR repositories created (one-time):

```bash
aws ecr create-repository --repository-name leadgenie-api    --region us-east-1
aws ecr create-repository --repository-name leadgenie-worker --region us-east-1
```

4. OIDC trust between GitHub Actions and AWS (one-time):

```bash
# Create OIDC provider
aws iam create-open-id-connect-provider \
  --url https://token.actions.githubusercontent.com \
  --client-id-list sts.amazonaws.com \
  --thumbprint-list 6938fd4d98bab03faadb97b34396831e3780aea1

# Create deploy role (replace ORG/REPO)
aws iam create-role \
  --role-name github-actions-leadgenie \
  --assume-role-policy-document '{
    "Version": "2012-10-17",
    "Statement": [{
      "Effect": "Allow",
      "Principal": { "Federated": "arn:aws:iam::ACCOUNT_ID:oidc-provider/token.actions.githubusercontent.com" },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": { "token.actions.githubusercontent.com:aud": "sts.amazonaws.com" },
        "StringLike":   { "token.actions.githubusercontent.com:sub": "repo:ORG/REPO:*" }
      }
    }]
  }'

aws iam attach-role-policy \
  --role-name github-actions-leadgenie \
  --policy-arn arn:aws:iam::aws:policy/AdministratorAccess
```

---

## GitHub Secrets Required

Go to repo → Settings → Secrets and Variables → Actions → New repository secret:

| Secret | Value |
|--------|-------|
| `AWS_DEPLOY_ROLE_ARN` | `arn:aws:iam::ACCOUNT_ID:role/github-actions-leadgenie` |
| `AWS_ACCOUNT_ID` | Your 12-digit AWS account ID |
| `ALERT_EMAIL` | Email to receive sleep/budget/error alerts |
| `ANTHROPIC_API_KEY` | From Anthropic console |
| `APOLLO_API_KEY` | From Apollo.io |
| `VOYAGE_API_KEY` | From Voyage AI |
| `GMAIL_APP_PASSWORD` | Gmail app password |
| `RESEND_API_KEY` | From Resend |

GitHub Variables (not secrets — repo → Settings → Variables):

| Variable | Value |
|----------|-------|
| `AWS_REGION` | `us-east-1` (or your region) |

---

## Deployment

Push to `aws/deploy-v2` branch — GitHub Actions handles everything:

```
Push → Build images → CDK deploy infra → Deploy frontend → Rolling ECS deploy → Smoke test
```

Manual trigger with destroy:

```
GitHub Actions → Deploy workflow → Run workflow → destroy = "destroy"
```

---

## Auto-Sleep Behaviour

- Every 5 minutes EventBridge triggers the `sleep-checker` Lambda
- If no API request in the last **15 minutes**: ECS scales to 0 tasks
- You receive an email alert with the **wake URL**
- Opening the wake URL scales services back to 2 API + 1 Worker tasks
- Services are ready in ~30–60 seconds

## CloudWatch Alarms

| Alarm | Condition | Action |
|-------|-----------|--------|
| `leadgenie-service-sleeping` | API task count < 1 | Email alert |
| `leadgenie-high-cpu` | CPU > 80% for 10 min | Email alert |
| `leadgenie-error-rate` | >10 x 5xx in 5 min | Email alert |
| AWS Budget | Spend > 50% or 90% of $30/mo limit | Email alert |

## CloudWatch Dashboard

https://console.aws.amazon.com/cloudwatch/home#dashboards:name=LeadGenie-AI

# AWS Deployment — OmniStore (Multi-Tenant E-Comm)

Recommended starter layout for this repo:

| Layer | Service | Notes |
|-------|---------|--------|
| Frontend (React/Vite) | **AWS Amplify Hosting** | Uses `client/amplify.yml` |
| Backend (FastAPI) | **AWS App Runner** (Docker) | Uses root `Dockerfile` |
| Database | **MongoDB Atlas** (keep) | No need to move to AWS yet |
| Secrets | App Runner env + Amplify env | Never put `KEY_SECRET` in the frontend |
| Payments | Razorpay Live keys | Same as Render/Vercel flow |

```text
Browser
  → Amplify (SPA)  https://app.example.com
  → App Runner API https://api.example.com
  → MongoDB Atlas
  → Razorpay
```

Keep Atlas for now. Moving DB to DocumentDB is optional later.

---

## 0. Prerequisites

1. AWS account + IAM user/role with Amplify, App Runner, ECR, IAM permissions  
2. MongoDB Atlas network access allows App Runner egress (often `0.0.0.0/0` for cloud APIs)  
3. Domain (optional): Route 53 or external DNS  
4. Razorpay **Live** Key Id + Secret (activated account)

Local check:

```bash
docker build -t omnistore-api .
docker run --rm -p 8000:8000 --env-file .env omnistore-api
```

---

## 1. Deploy API — App Runner

### 1.1 Build & push image (ECR)

```bash
# Region example: ap-south-1 (Mumbai)
aws ecr create-repository --repository-name omnistore-api --region ap-south-1

# Login
aws ecr get-login-password --region ap-south-1 \
  | docker login --username AWS --password-stdin <ACCOUNT_ID>.dkr.ecr.ap-south-1.amazonaws.com

docker build -t omnistore-api .
docker tag omnistore-api:latest <ACCOUNT_ID>.dkr.ecr.ap-south-1.amazonaws.com/omnistore-api:latest
docker push <ACCOUNT_ID>.dkr.ecr.ap-south-1.amazonaws.com/omnistore-api:latest
```

### 1.2 Create App Runner service

Console: **App Runner → Create service → Container registry → Amazon ECR**

- Port: `8000` (or whatever `PORT` you set)
- Health check: HTTP `/docs` or `/` (whichever returns 200)
- Auto-deploy: optional on new ECR image

### 1.3 Environment variables (App Runner)

| Variable | Example |
|----------|---------|
| `MONGO_URI` | Atlas `mongodb+srv://...` |
| `DATABASE_NAME` | `Multi_Tenant_E_Comm` |
| `SECRET_KEY` | long random production secret |
| `ALGORITHM` | `HS256` |
| `ENVIRONMENT` | `production` |
| `CORS_ORIGINS` | `https://YOUR_AMPLIFY_DOMAIN` (comma-separated if many) |
| `FRONTEND_URL` | `https://YOUR_AMPLIFY_DOMAIN` |
| `RAZORPAY_KEY_ID` | `rzp_live_...` |
| `RAZORPAY_KEY_SECRET` | live secret |
| `RAZORPAY_WEBHOOK_SECRET` | if webhooks enabled |
| `EMAIL` / `APP_PASSWORD` | optional (password reset) |

After deploy, copy the App Runner URL, e.g.  
`https://xxxxx.ap-south-1.awsapprunner.com`

Test: `https://xxxxx.../docs`

---

## 2. Deploy Frontend — Amplify

1. Amplify Hosting → **Host web app** → connect GitHub repo  
2. App root / monorepo: set **root directory** to `client`  
3. Build spec: use `client/amplify.yml` (already in repo)  
4. Build environment variables:

| Variable | Value |
|----------|--------|
| `VITE_API_URL` | App Runner base URL **without** trailing slash, e.g. `https://xxxxx.ap-south-1.awsapprunner.com` |
| `VITE_RAZORPAY_KEY_ID` | same **Key Id** as API (`rzp_live_...`) |

> Vite bakes `VITE_*` at **build** time. Change env → **redeploy**.

5. Rewrite SPA routes (Amplify Console → Rewrites):

| Source | Target | Type |
|--------|--------|------|
| `/<*>` | `/index.html` | 200 (Rewrite) |

If you prefer the frontend to call `/api/...` via Amplify rewrites instead of `VITE_API_URL`, add a reverse proxy rewrite to App Runner and leave `VITE_API_URL` empty so the app uses `/api` — then mirror your old Vercel rewrite pattern. Simplest first path: set `VITE_API_URL` to App Runner.

6. Update App Runner `CORS_ORIGINS` + `FRONTEND_URL` to the Amplify URL, then restart/redeploy API if needed.

---

## 3. Razorpay on AWS

1. Dashboard → **Live Mode** → API Keys → Key Id + Secret  
2. API (App Runner): `RAZORPAY_KEY_ID` + `RAZORPAY_KEY_SECRET`  
3. Amplify: `VITE_RAZORPAY_KEY_ID` only  
4. Optional webhook:  
   `https://YOUR_APP_RUNNER_URL/payments/webhook`  
   with `RAZORPAY_WEBHOOK_SECRET`

Do **not** use `razorpay.me` for checkout — Standard Checkout + these keys.

---

## 4. Cutover checklist

- [ ] API `/docs` loads on App Runner  
- [ ] Amplify site loads; login works  
- [ ] `CORS` allows Amplify origin  
- [ ] Create order + Razorpay test/live payment  
- [ ] Password-reset email uses `FRONTEND_URL`  
- [ ] Atlas IP / network access OK  
- [ ] Custom domains (optional): Amplify + App Runner custom domain / Route 53  

---

## 5. Cost-conscious tips

- Start App Runner on small CPU/memory; scale later  
- Amplify free tier often covers early traffic  
- Keep MongoDB Atlas free/shared until load grows  
- Use `ap-south-1` (Mumbai) if customers are in India (latency + Razorpay)

---

## 6. Later upgrades (optional)

| Need | Move to |
|------|---------|
| More control / multi-service | ECS Fargate |
| Preview environments | Amplify branches + staging App Runner |
| Secrets rotation | AWS Secrets Manager → App Runner |
| WAF / DDoS | CloudFront + WAF in front of Amplify/API |
| Strict isolation | Separate AWS accounts per env (dev/stage/prod) |

---

## 7. Repo files added for AWS

| File | Purpose |
|------|---------|
| `Dockerfile` | FastAPI image for App Runner / ECS |
| `.dockerignore` | Keep image small / exclude client & secrets |
| `client/amplify.yml` | Amplify build for Vite app |
| `docs/aws-deployment.md` | This guide |

---

## 8. Rollback

Keep Vercel + Render running until AWS checkout + auth are verified. Point DNS only after smoke tests pass.

# BIK Prestige Enterprise — Remote Pilot Deployment Guide

**Purpose:** Deploy the application to a secure, internet-accessible hosting environment so the owner, workers, and collectors can use it from their own devices.

---

## Architecture

```
                    INTERNET
                       │
                       ▼
                ┌──────────────┐
                │ Render       │
                │ Web Service  │ ← Next.js app (HTTPS)
                │ (Free tier)  │
                └──────┬───────┘
                       │
                ┌──────────────┐
                │ Render       │
                │ PostgreSQL   │ ← bik_pilot database
                │ (Free 30d)   │
                └──────────────┘
                       │
          ┌────────────┼───────────────┐
          │            │               │
       OWNER        MOMO WORKERS   SUSU COLLECTORS
       laptop         phones          phones
```

---

## Hosting Choice: Render

| Feature | Details |
|---------|---------|
| **Provider** | [render.com](https://render.com) |
| **Web Service** | Free tier (750 hrs/month, sleeps after 15 min idle) |
| **PostgreSQL** | Free tier (30 days, then $6/month) |
| **HTTPS** | Automatic |
| **Deployment** | Git-based (push to deploy) |
| **Estimated pilot cost** | $0 for first 30 days, then ~$6/month |

**Why Render:**
- Both app and database in one platform
- Automatic HTTPS and free SSL
- Managed PostgreSQL with backups
- Simple deployment from Git
- No commercial use restrictions on free tier

---

## Pre-Deployment Checklist

### Code Readiness ✅
- [x] No hardcoded `localhost` in source code
- [x] No hardcoded credentials
- [x] `.env` files gitignored
- [x] Security headers configured
- [x] JWT authentication working
- [x] Cookie security (httpOnly, secure)
- [x] Build passes
- [x] Tests pass (74/74)
- [x] Typecheck passes
- [x] Lint passes (0 errors)
- [x] No filesystem writes at runtime

### Database Readiness ✅
- [x] PostgreSQL schema ready
- [x] Seed script ready
- [x] Pilot data clean
- [x] Backup procedure documented

### Environment Badge ✅
- [x] `APP_ENV=PILOT` shows PILOT badge
- [x] `APP_ENV=DEVELOPMENT` shows DEVELOPMENT badge
- [x] `APP_ENV=production` shows no badge
- [x] Badge is server component (no hydration mismatch)

---

## Deployment Steps

### Step 1: Create Render Account

1. Go to [render.com](https://render.com)
2. Sign up with GitHub or email
3. No credit card required for free tier

### Step 2: Push Code to GitHub

```bash
cd "Momo module"
git init
git add .
git commit -m "BIK Prestige Enterprise — Ready for deployment"
git remote add origin <your-github-repo-url>
git push -u origin main
```

### Step 3: Create PostgreSQL Database on Render

1. In Render dashboard, click **New +** → **PostgreSQL**
2. Name: `bik-prestige-db`
3. Database: `bik_pilot`
4. User: `bik`
5. Plan: **Free**
6. Click **Create Database**
7. Copy the **Internal Database URL** (you'll need this)

### Step 4: Create Web Service on Render

1. In Render dashboard, click **New +** → **Web Service**
2. Connect your GitHub repository
3. Configure:
   - **Name:** `bik-prestige`
   - **Runtime:** Node
   - **Build Command:** `npm install && npx prisma generate && npx prisma migrate deploy && npm run build`
   - **Start Command:** `npm start`
   - **Plan:** Free

### Step 5: Set Environment Variables

In the Web Service settings, add these environment variables:

| Key | Value | Notes |
|-----|-------|-------|
| `DATABASE_URL` | *(from Step 3)* | Internal Database URL from Render |
| `JWT_SECRET` | *(generate new)* | `openssl rand -base64 32` |
| `APP_ENV` | `PILOT` | Shows PILOT badge |
| `NODE_ENV` | `production` | Enables secure cookies |

**Important:** Never commit these values to source control.

### Step 6: Deploy

1. Click **Create Web Service**
2. Render will automatically build and deploy
3. Wait for deployment to complete (usually 2-5 minutes)
4. Note the deployed URL (e.g., `https://bik-prestige.onrender.com`)

### Step 7: Apply Database Schema

After first deployment, the migrations run automatically via the build command.

If you need to seed initial data, add to the build command:
```
npm install && npx prisma generate && npx prisma migrate deploy && npx tsx prisma/seed.ts && npm run build
```

### Step 8: Verify Deployment

1. Open the deployed URL
2. Verify PILOT badge is displayed
3. Log in with pilot admin credentials
4. Verify dashboard loads
5. Test all user roles

---

## Data Migration (If Needed)

If the hosted database is different from the local `bik_pilot`:

### Export from Local
```bash
docker exec bik-prestige-pg pg_dump -U bik -d bik_pilot -Fc > backups/pilot-export.dump
```

### Import to Hosted
```bash
pg_dump -h <host> -U <user> -d bik_pilot -Fc < backups/pilot-export.dump
```

### Verify After Migration
```sql
SELECT 'User' as t, COUNT(*) FROM "User"
UNION ALL SELECT 'Location', COUNT(*) FROM "Location"
UNION ALL SELECT 'Customer', COUNT(*) FROM "Customer"
UNION ALL SELECT 'SusuAccount', COUNT(*) FROM "SusuAccount"
UNION ALL SELECT 'Collector', COUNT(*) FROM "Collector";
```

---

## Post-Deployment Verification

### From Developer Machine
```bash
# Test the deployed URL
curl -s -o /dev/null -w "%{http_code}" https://your-app.onrender.com/login
# Expected: 200
```

### From External Device (Mandatory)
1. Open the deployed URL on an Android phone (cellular data, not same WiFi)
2. Log in as admin
3. Verify dashboard loads
4. Log in as worker
5. Verify worker dashboard
6. Log in as collector
7. Verify collector dashboard

### Security Verification
- [ ] HTTPS active (lock icon in browser)
- [ ] Secure cookies (httpOnly, secure)
- [ ] Worker cannot access admin routes
- [ ] Collector cannot access admin routes
- [ ] Unauthenticated access redirected to login
- [ ] No secrets exposed in browser

---

## Backup Procedure

### Before Deployment
```bash
docker exec bik-prestige-pg pg_dump -U bik -d bik_pilot -Fc > backups/pilot-pre-deploy-$(date +%Y%m%d).dump
```

### After Deployment (Remote Backup)
```bash
pg_dump -h <host> -U <user> -d bik_pilot -Fc > backups/pilot-remote-$(date +%Y%m%d).dump
```

### Backup Schedule
- **Daily:** Automated at end of business day
- **Weekly:** Full compressed backup
- **Retention:** 7 daily, 4 weekly

---

## Rollback Procedure

If deployment fails:

1. **Application rollback:**
   - In Render dashboard, go to Web Service → Events
   - Click **Redeploy** on the last working deployment

2. **Database rollback:**
   ```bash
   pg_restore -h <host> -U <user> -d bik_pilot backup.dump
   ```

3. **Verify:** Open the URL and confirm functionality

---

## Environment Badge Behavior

| APP_ENV | NODE_ENV | Badge |
|---------|----------|-------|
| `DEVELOPMENT` | any | DEVELOPMENT (yellow) |
| `STAGING` | any | STAGING (blue) |
| `PILOT` | `production` | PILOT (orange) |
| `production` | `production` | *(no badge)* |
| *(not set)* | `production` | Checks DATABASE_URL for bik_pilot → PILOT |
| *(not set)* | `development` | DEVELOPMENT |

---

## Cost Summary

| Period | Web Service | PostgreSQL | Total |
|--------|-------------|------------|-------|
| First 30 days | Free (750 hrs) | Free | **$0** |
| After 30 days | Free (750 hrs) | $6/month | **$6/month** |

**Notes:**
- Free web service sleeps after 15 min of inactivity (first request wakes it)
- First wake-up takes 30-60 seconds
- Subsequent requests are fast
- 750 hours/month is sufficient for pilot use

---

## Troubleshooting

### "Application failed to start"
- Check Render logs for errors
- Verify `DATABASE_URL` is correct
- Verify `JWT_SECRET` is set

### "PRAISMA: PrismaClient could not locate the query engine"
- Build command must include `npx prisma generate`
- Check build logs for Prisma errors

### "Authentication failed"
- Verify `JWT_SECRET` matches between deployments
- Clear browser cookies and retry

### "Database connection refused"
- Verify PostgreSQL is running on Render
- Check `DATABASE_URL` format: `postgresql://user:pass@host:5432/dbname`

### Badge shows DEVELOPMENT instead of PILOT
- Verify `APP_ENV=PILOT` is set in environment variables
- Redeploy after setting environment variables

---

*Built by BloomCore Technologies for BIK Prestige Enterprise*

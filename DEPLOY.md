# 🚀 PulseRadar Deployment Guide

## Prerequisites Checklist

- [ ] Cloudflare account (free tier works!) → https://dash.cloudflare.com/sign-up
- [ ] Node.js 18+ installed
- [ ] Wrangler CLI installed (`npm install -g wrangler`)

## Step 1: Cloudflare Authentication

```bash
# Login to Cloudflare (opens browser)
wrangler login
```

This will open your browser to authenticate. Once done, you're ready to deploy!

## Step 2: Create D1 Database

```bash
cd /Users/kellyborsuk/Documents/gas/p/pulseradar
wrangler d1 create pulseradar-db
```

**IMPORTANT**: Copy the `database_id` from the output that looks like this:

```
✅ Successfully created DB 'pulseradar-db'

[[d1_databases]]
binding = "DB"
database_name = "pulseradar-db"
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"  <-- COPY THIS
```

## Step 3: Update wrangler.toml

Edit `wrangler.toml` and paste your database_id:

```toml
[[d1_databases]]
binding = "DB"
database_name = "pulseradar-db"
database_id = "PASTE_YOUR_DATABASE_ID_HERE"  # <-- Paste it here
```

## Step 4: Apply Database Migrations

```bash
wrangler d1 migrations apply pulseradar-db
```

This creates your tables in the cloud database.

## Step 5: Set Production Secrets

```bash
wrangler secret put INTERNAL_API_KEY
```

When prompted, enter a strong secret key (e.g., `pulseradar-prod-key-$(openssl rand -hex 16)`)

**Save this key!** You'll need it to call your API.

## Step 6: Deploy to Cloudflare

```bash
npm run deploy
```

**Done!** Your API will be live at: `https://pulseradar.YOUR_SUBDOMAIN.workers.dev`

The output will show your actual URL.

## Step 7: Test Your Deployment

```bash
# Replace with your actual URL and API key
export PULSERADAR_URL="https://pulseradar.YOUR_SUBDOMAIN.workers.dev"
export API_KEY="your-secret-key"

# Test discover endpoint
curl -X POST $PULSERADAR_URL/discover \
  -H "Content-Type: application/json" \
  -H "X-Internal-API-Key: $API_KEY" \
  -d '{"limit": 10}'
```

## Troubleshooting

### "No database found" error
- Make sure you updated `wrangler.toml` with your database_id
- Run migrations: `wrangler d1 migrations apply pulseradar-db`

### "Authentication failed"
- Run `wrangler login` again
- Check you're logged into the right Cloudflare account

### "Worker exceeds size limit"
- Run `npm run deploy` again (sometimes first deploy fails)

## Optional: Custom Domain

Want `pulseradar.yourdomain.com` instead of the workers.dev URL?

1. Go to Cloudflare Dashboard → Workers & Pages
2. Click your `pulseradar` worker
3. Settings → Triggers → Add Custom Domain
4. Enter your domain and click Add

## Monitoring

View logs in real-time:
```bash
wrangler tail
```

Or check the Cloudflare dashboard:
- Go to Workers & Pages → pulseradar → Logs

## Update Your Deployment

Made changes? Just run:
```bash
npm run deploy
```

Cloudflare will automatically deploy the new version.

---

**Total time to deploy: ~5 minutes**

**Cost: $0/month** (Cloudflare free tier)

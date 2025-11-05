# 🚀 PulseRadar - Quick Start (5 Minutes)

## ✅ Status: READY TO DEPLOY

All code has been tested and validated. You just need to deploy it to Cloudflare!

---

## 🎯 What You Need

1. **Cloudflare Account** (free tier works!)
   - Sign up: https://dash.cloudflare.com/sign-up

2. **5 Minutes** ⏱️

That's it!

---

## 📋 Deployment Steps

### Step 1: Login to Cloudflare (1 min)

```bash
cd /Users/kellyborsuk/Documents/gas/p/pulseradar
wrangler login
```

This opens your browser to authenticate. Click "Allow" and you're done.

### Step 2: Create Database (1 min)

```bash
wrangler d1 create pulseradar-db
```

**Copy the `database_id`** from the output (looks like: `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`)

### Step 3: Update Config (30 seconds)

Edit `wrangler.toml` and paste your database_id on line 9:

```toml
database_id = "PASTE_YOUR_DATABASE_ID_HERE"
```

### Step 4: Apply Database Schema (30 seconds)

```bash
wrangler d1 migrations apply pulseradar-db
```

### Step 5: Set Secret Key (1 min)

```bash
wrangler secret put INTERNAL_API_KEY
```

When prompted, enter a secret key like: `pulseradar-secret-$(date +%s)`

**Save this key!** You'll need it to use the API.

### Step 6: Deploy! (1 min)

```bash
npm run deploy
```

**Done!** 🎉

The output will show your live URL:
```
Published pulseradar
  https://pulseradar.YOUR_SUBDOMAIN.workers.dev
```

---

## 🧪 Test Your Deployment

```bash
# Replace with your actual URL and key
export URL="https://pulseradar.YOUR_SUBDOMAIN.workers.dev"
export KEY="your-secret-key"

# Test it works
curl -X POST $URL/discover \
  -H "Content-Type: application/json" \
  -H "X-Internal-API-Key: $KEY" \
  -d '{"limit": 5}'
```

You should see a JSON response with discovered endpoints!

---

## 📊 What Happens Next

1. **First 6 hours**: Discovery job runs, finds x402 endpoints
2. **After 30 min**: Testing starts, endpoints get tested
3. **After 1 hour**: Trust scores calculated
4. **Ongoing**: Automatic monitoring every 30 minutes

---

## 💡 Using PulseRadar in Your Agents

```typescript
// Your agents can now find the best endpoints:
const response = await fetch('https://pulseradar.YOUR_SUBDOMAIN.workers.dev/discover', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Internal-API-Key': process.env.PULSERADAR_KEY,
  },
  body: JSON.stringify({ limit: 10 }),
});

const { endpoints } = await response.json();
const bestEndpoint = endpoints[0]; // Use the highest-rated one!
```

---

## 🔧 Troubleshooting

**"No database found" error**
- Did you update `wrangler.toml` with your database_id?
- Run migrations: `wrangler d1 migrations apply pulseradar-db`

**"Authentication failed"**
- Run `wrangler login` again

**"Worker too large"**
- Run `npm run deploy` again (sometimes takes 2 tries)

---

## 📚 Documentation

- **Full Deployment Guide**: `DEPLOY.md`
- **API Documentation**: `README.md`
- **Code**: All in `/Users/kellyborsuk/Documents/gas/p/pulseradar`

---

## 💰 Cost

**$0/month** on Cloudflare free tier

(Covers 3M requests/month - more than enough for alpha)

---

## 🎨 What You Built

- ✅ Global endpoint discovery (x402scan + GitHub)
- ✅ Automated testing (every 30 minutes)
- ✅ Trust scoring algorithm
- ✅ 4 API endpoints (discover, trust-score, verify-live, compare)
- ✅ x402 payment integration ($0.50 for external users)
- ✅ FREE for your internal agents
- ✅ Deployed globally on Cloudflare edge (285+ cities)
- ✅ D1 database for persistence
- ✅ Cron jobs for background processing

---

**Ready to vibe? Deploy it! 🚀**

Just run through the 6 steps above and you're live in 5 minutes.

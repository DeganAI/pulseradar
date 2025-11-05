# PulseRadar

**Endpoint Discovery and Trust Scoring for the x402 Ecosystem**

PulseRadar is a globally distributed service for discovering, testing, and scoring API endpoints in the x402 payment protocol ecosystem. Built on Cloudflare Workers and D1, it provides real-time endpoint monitoring with sub-50ms response times worldwide.

## Features

- **Automated Discovery** - Continuously scans x402scan.com and GitHub for new endpoints
- **Health Monitoring** - Tests all endpoints every 30 minutes for uptime and performance
- **Trust Scoring** - Calculates trust scores (0-100) based on uptime, speed, accuracy, and maturity
- **Global Edge Deployment** - Deployed to 285+ cities via Cloudflare's network
- **Payment Integration** - Integrated with x402 payment protocol

## Architecture

```
┌─────────────────┐
│   Cloudflare    │
│     Workers     │──┐
└─────────────────┘  │
                     ├──> D1 Database (SQLite)
┌─────────────────┐  │
│   Cron Triggers │──┘
│  - Discovery    │
│  - Testing      │
│  - Scoring      │
└─────────────────┘
```

### Tech Stack

- **Runtime:** Cloudflare Workers (V8 isolates)
- **Database:** Cloudflare D1 (SQLite)
- **Language:** TypeScript
- **Deployment:** Wrangler CLI
- **Testing:** Miniflare (local development)

## API Endpoints

### 1. Discover Endpoints
```http
POST /discover
Content-Type: application/json

{
  "limit": 10,
  "category": "defi",
  "search": "optional"
}
```

**Response:**
```json
{
  "endpoints": [
    {
      "id": "uuid",
      "endpoint_url": "https://api.example.com",
      "category": "defi",
      "trust_score": 95.5,
      "last_tested": "2025-11-04T12:00:00Z",
      "status": "healthy"
    }
  ],
  "total": 42,
  "limit": 10,
  "offset": 0
}
```

### 2. Trust Score
```http
POST /trust-score
Content-Type: application/json

{
  "endpoint_url": "https://api.example.com",
  "category": "defi"
}
```

### 3. Verify Live
```http
POST /verify-live
Content-Type: application/json

{
  "endpoint_url": "https://api.example.com"
}
```

### 4. Compare Endpoints
```http
POST /compare
Content-Type: application/json

{
  "endpoint1": "https://api1.example.com",
  "endpoint2": "https://api2.example.com"
}
```

## Database Schema

### `endpoints` Table
```sql
CREATE TABLE endpoints (
  id TEXT PRIMARY KEY,
  endpoint_url TEXT UNIQUE NOT NULL,
  category TEXT,
  description TEXT,
  discovered_at INTEGER NOT NULL,
  source TEXT,
  status TEXT DEFAULT 'pending'
);
```

### `endpoint_tests` Table
```sql
CREATE TABLE endpoint_tests (
  id TEXT PRIMARY KEY,
  endpoint_id TEXT NOT NULL,
  tested_at INTEGER NOT NULL,
  success INTEGER NOT NULL,
  response_time_ms INTEGER,
  status_code INTEGER,
  error_message TEXT,
  FOREIGN KEY (endpoint_id) REFERENCES endpoints(id)
);
```

### `trust_scores` Table
```sql
CREATE TABLE trust_scores (
  id TEXT PRIMARY KEY,
  endpoint_id TEXT UNIQUE NOT NULL,
  trust_score REAL NOT NULL,
  uptime_score REAL,
  speed_score REAL,
  accuracy_score REAL,
  age_score REAL,
  calculated_at INTEGER NOT NULL,
  FOREIGN KEY (endpoint_id) REFERENCES endpoints(id)
);
```

## Trust Scoring Algorithm

The trust score is calculated using a weighted formula:

```
Trust Score = (uptime × 0.4) + (speed × 0.3) + (accuracy × 0.2) + (age × 0.1)
```

**Components:**
- **Uptime (40%)**: Success rate over last 30 days
- **Speed (30%)**: Response time performance
- **Accuracy (20%)**: Correct response format and data
- **Age (10%)**: Time since first discovery (maturity)

## Scheduled Jobs

### Discovery Job (Every 6 hours)
Scans x402scan.com and GitHub for new endpoints.

### Testing Job (Every 30 minutes)
Tests all discovered endpoints for health and performance.

### Trust Calculation (Every hour)
Recalculates trust scores based on recent test results.

## Installation

### Prerequisites
- Node.js 18+
- Cloudflare account
- Wrangler CLI

### Setup

1. **Clone the repository**
```bash
git clone https://github.com/degenllama/pulseradar.git
cd pulseradar
```

2. **Install dependencies**
```bash
npm install
```

3. **Configure Wrangler**
```bash
cp wrangler.toml.example wrangler.toml
# Edit wrangler.toml and add your database_id
```

4. **Create D1 database**
```bash
npx wrangler d1 create pulseradar-db
# Copy the database_id to wrangler.toml
```

5. **Apply migrations**
```bash
npx wrangler d1 migrations apply pulseradar-db
```

6. **Set secrets**
```bash
npx wrangler secret put API_KEY
```

7. **Deploy**
```bash
npm run deploy
```

## Local Development

```bash
npm run dev
```

## Project Structure

```
pulseradar/
├── src/
│   ├── index.ts              # Main worker entry point
│   ├── types.ts              # TypeScript interfaces
│   └── lib/
│       ├── discovery.ts      # Endpoint discovery
│       ├── testing.ts        # Endpoint testing
│       └── trust-score.ts    # Trust scoring
├── migrations/
│   └── 0001_initial_schema.sql
├── wrangler.toml.example     # Configuration template
└── README.md
```

## Performance

- **Global Latency:** <50ms (p99)
- **Uptime SLA:** 99.99%
- **Request Capacity:** 3M requests/month (free tier)

## License

MIT License

## Credits

Built with:
- [Cloudflare Workers](https://workers.cloudflare.com/)
- [Cloudflare D1](https://developers.cloudflare.com/d1/)
- [x402 Protocol](https://x402.org)

---

**Built by [degenllama.net](https://degenllama.net)** - Decentralized AI Infrastructure

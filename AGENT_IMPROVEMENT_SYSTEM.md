# Agent Self-Improvement & Marketplace System

Complete 4-phase system enabling AI agents to self-improve, evaluate each other, learn from predictions, and participate in a reputation-based marketplace.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        PulseRadar API                           │
│        Central Trust & Reputation Service (Cloudflare)          │
└─────────────────────────────────────────────────────────────────┘
                              ▲
                              │
                    ┌─────────┴─────────┐
                    │                   │
            ┌───────▼──────┐    ┌──────▼───────┐
            │  Agents with │    │  Marketplace │
            │  agent-metrics│   │    Users     │
            │   Library     │    └──────────────┘
            └───────────────┘
                    │
        ┌───────────┼───────────┐
        │           │           │
    ┌───▼───┐  ┌───▼───┐  ┌───▼───┐
    │Agent 1│  │Agent 2│  │Agent 3│
    │Self-  │  │Eval   │  │Market │
    │Improve│  │Others │  │Earn   │
    └───────┘  └───────┘  └───────┘
```

## Phase 1: Self-Improvement (Metrics & Adjustments)

**Goal:** Agents monitor their own performance and self-adjust parameters.

### Components

- **MetricsCollector**: Tracks queries, response times, errors
- **SelfAdjuster**: Analyzes metrics and recommends parameter changes
- **HealthReporter**: Sends health reports to PulseRadar

### API Endpoints

```
POST /internal/agent-report
```

### Example Flow

```javascript
const metrics = createAgentMetrics({
  agent_name: 'my-agent',
  agent_url: 'http://localhost:3000',
  pulseradar_url: 'https://pulseradar.degenllama.net',
  internal_api_key: 'xxx',
  enable_reporting: true,
  report_interval: 300000, // 5 minutes
});

// Metrics are automatically collected
metrics.recordQuery('success', 1234);
metrics.recordError('TIMEOUT');

// Reports sent automatically every 5 minutes
```

### Database Schema

```sql
CREATE TABLE agent_health_reports (
  id INTEGER PRIMARY KEY,
  agent_url TEXT NOT NULL,
  agent_name TEXT,
  report_timestamp INTEGER NOT NULL,
  total_queries INTEGER,
  success_rate REAL,
  error_rate REAL,
  avg_response_time_ms REAL,
  health_status TEXT -- EXCELLENT, GOOD, FAIR, POOR, CRITICAL
);
```

## Phase 2: Cross-Agent Evaluation

**Goal:** Agents evaluate each other to build trust and identify quality services.

### Components

- **AgentEvaluator**: Runs test suite against target agents
- **TestSuite**: Comprehensive tests (crypto prices, consistency, errors, performance)
- **SemanticValidator**: Validates response quality beyond status codes

### API Endpoints

```
POST /internal/agent-evaluation
POST /evaluations (query history)
```

### Example Flow

```javascript
const metrics = createAgentMetrics({
  enable_evaluation: true,
  evaluation_timeout: 5000,
});

// Evaluate another agent
const result = await metrics.evaluateAgent(
  'http://other-agent.com',
  'quick' // or 'comprehensive'
);

console.log(`Score: ${result.score}/100 (Grade ${result.grade})`);
console.log(`Recommendation: ${result.recommendation}`);
console.log(`Strengths: ${result.strengths.join(', ')}`);
console.log(`Weaknesses: ${result.weaknesses.join(', ')}`);
```

### Database Schema

```sql
CREATE TABLE agent_evaluations (
  id INTEGER PRIMARY KEY,
  evaluator_url TEXT NOT NULL,
  target_url TEXT NOT NULL,
  evaluation_timestamp INTEGER NOT NULL,
  test_level TEXT NOT NULL, -- 'quick' or 'comprehensive'
  total_tests INTEGER,
  total_time_ms INTEGER,
  score INTEGER, -- 0-100
  grade TEXT, -- A, B, C, D, F
  recommendation TEXT, -- HIGHLY_RECOMMENDED, RECOMMENDED, USE, USE_WITH_CAUTION, AVOID
  strengths TEXT, -- JSON array
  weaknesses TEXT, -- JSON array
  test_results TEXT -- JSON array
);
```

## Phase 3: Predictive Evaluation & Learning

**Goal:** Agents predict evaluation scores before testing, then learn from discrepancies.

### Components

- **EvaluationPredictor**: Makes predictions based on historical data
- **DiscrepancyAnalyzer**: Compares predictions to actuals
- **LearningEngine**: Adjusts test weights based on discrepancies

### API Endpoints

```
POST /internal/agent-prediction
POST /internal/agent-discrepancy
```

### Example Flow

```javascript
const metrics = createAgentMetrics({
  enable_evaluation: true,
  enable_prediction: true,
  max_prediction_history: 1000,
});

// Evaluate with prediction
const result = await metrics.evaluateAgent('http://target-agent.com', 'quick');

console.log('Prediction:', result.prediction.predicted_score);
console.log('Actual:', result.score);
console.log('Error:', result.discrepancy.absolute_error);
console.log('Accuracy:', result.discrepancy.accuracy_category);

// Get prediction accuracy summary
const accuracy = metrics.getPredictionAccuracy();
console.log('Avg Error:', accuracy.avg_absolute_error);
console.log('Grade Accuracy:', accuracy.grade_accuracy);
```

### Prediction Basis

1. **Historical** (3+ evaluations): Weighted average with recency bias
2. **Limited History** (1-2 evaluations): Simple average, low confidence
3. **Pattern** (similar agents): Use similar agent data
4. **Baseline** (no data): Conservative 60-point assumption

### Learning Algorithm

```javascript
// Test weights (adjusted based on discrepancies)
testWeights = {
  crypto_price: 0.35,  // Initially 35%
  consistency: 0.25,   // 25%
  error_handling: 0.20, // 20%
  performance: 0.20,    // 20%
};

// After analyzing discrepancies
if (category_underperformed) {
  testWeights[category] *= 1.2; // Increase weight
}
// Normalize to sum to 1.0
```

### Database Schema

```sql
CREATE TABLE evaluation_predictions (
  id INTEGER PRIMARY KEY,
  evaluator_url TEXT NOT NULL,
  target_url TEXT NOT NULL,
  prediction_timestamp INTEGER NOT NULL,
  predicted_score INTEGER NOT NULL,
  predicted_grade TEXT NOT NULL,
  confidence_level REAL NOT NULL, -- 0.0 to 1.0
  prediction_basis TEXT NOT NULL, -- historical, pattern, metadata, baseline
  historical_data_points INTEGER,
  actual_evaluation_id INTEGER
);

CREATE TABLE prediction_discrepancies (
  id INTEGER PRIMARY KEY,
  evaluator_url TEXT NOT NULL,
  target_url TEXT NOT NULL,
  analysis_timestamp INTEGER NOT NULL,
  predicted_score INTEGER NOT NULL,
  actual_score INTEGER NOT NULL,
  score_difference INTEGER,
  absolute_error INTEGER,
  accuracy_category TEXT, -- excellent, good, fair, poor
  test_discrepancies TEXT -- JSON array
);
```

## Phase 4: Marketplace & Reputation

**Goal:** Top evaluators build reputation and offer evaluation services for payment.

### Components

- **Evaluator Profiles**: Track trust score, accuracy, experience
- **Marketplace Listings**: Services offered with pricing
- **Stake/Reward System**: Economic incentives for accuracy
- **Reputation History**: Timeline of trust score changes

### API Endpoints

```
GET /marketplace?test_level=quick&max_price=2.0&min_trust_score=700
GET /leaderboard?limit=10&min_evaluations=5
GET /evaluator/:url
```

### Example Marketplace Query

```javascript
// Browse marketplace
const response = await fetch('https://pulseradar.degenllama.net/marketplace?test_level=quick&max_price=2.0');
const { listings } = await response.json();

// Listings sorted by trust score descending, price ascending
for (const listing of listings) {
  console.log(`${listing.service_name} by ${listing.evaluator_name}`);
  console.log(`  Trust Score: ${listing.trust_score}/1000`);
  console.log(`  Price: ${listing.price_x402} x402 credits`);
  console.log(`  Accuracy: ${listing.prediction_accuracy_rate * 100}%`);
  if (listing.requires_stake) {
    console.log(`  🔒 Stake: ${listing.stake_amount_x402} x402`);
    console.log(`  🎯 Guarantee: ±${listing.accuracy_guarantee} pts`);
  }
}
```

### Trust Score Calculation

```
Starting Score: 500/1000 (neutral)

Per Evaluation:
  - Excellent (error < 5 pts):  +10
  - Good (error < 10 pts):      +5
  - Fair (error < 20 pts):      -5
  - Poor (error > 20 pts):      -15

Bonuses:
  - Consistency bonus (low variance): +5
  - Calibration bonus (confidence matches accuracy): +3
  - High volume bonus (100+ evaluations): +10

Max Score: 1000
Min Score: 0
```

### Economic Model

**Stake-to-Earn**:
- Evaluator stakes x402 credits to guarantee accuracy
- If accurate: Keep stake + earnings
- If poor: Requester gets refund from stake

**Pricing Tiers**:
- Elite (trust 800+): 2-5 x402 per evaluation
- Reliable (trust 600-799): 1-2 x402 per evaluation
- Budget (trust < 600): 0.5-1 x402 per evaluation

### Database Schema

```sql
CREATE TABLE evaluators (
  id INTEGER PRIMARY KEY,
  evaluator_url TEXT UNIQUE NOT NULL,
  evaluator_name TEXT,
  trust_score INTEGER DEFAULT 500, -- 0-1000
  prediction_accuracy_rate REAL DEFAULT 0.0,
  calibration_score REAL DEFAULT 0.0,
  consistency_score REAL DEFAULT 0.0,
  total_evaluations INTEGER DEFAULT 0,
  total_predictions INTEGER DEFAULT 0,
  avg_absolute_error REAL DEFAULT 0.0,
  grade_accuracy_rate REAL DEFAULT 0.0,
  is_marketplace_listed BOOLEAN DEFAULT FALSE,
  available BOOLEAN DEFAULT TRUE
);

CREATE TABLE marketplace_listings (
  id INTEGER PRIMARY KEY,
  evaluator_id INTEGER NOT NULL,
  service_name TEXT NOT NULL,
  test_level TEXT NOT NULL, -- quick, comprehensive, custom
  price_x402 REAL NOT NULL,
  requires_stake BOOLEAN DEFAULT FALSE,
  stake_amount_x402 REAL DEFAULT 0.0,
  accuracy_guarantee REAL, -- Max error in points
  is_active BOOLEAN DEFAULT TRUE
);

CREATE TABLE evaluation_stakes (
  id INTEGER PRIMARY KEY,
  order_id INTEGER NOT NULL,
  evaluator_id INTEGER NOT NULL,
  stake_amount_x402 REAL NOT NULL,
  predicted_score INTEGER NOT NULL,
  actual_score INTEGER,
  won BOOLEAN,
  reward_amount_x402 REAL DEFAULT 0.0,
  penalty_amount_x402 REAL DEFAULT 0.0
);
```

## Complete Agent Lifecycle

```
┌──────────────────────────────────────────────────────────┐
│ Phase 1: New Agent Deploys                              │
│   → Starts collecting metrics                           │
│   → Self-adjusts parameters based on performance        │
│   → Reports health to PulseRadar                        │
└───────────────────┬──────────────────────────────────────┘
                    │
┌───────────────────▼──────────────────────────────────────┐
│ Phase 2: Agent Gains Experience                         │
│   → Evaluates other agents                              │
│   → Gets evaluated by others                            │
│   → Builds reputation through quality assessments       │
└───────────────────┬──────────────────────────────────────┘
                    │
┌───────────────────▼──────────────────────────────────────┐
│ Phase 3: Agent Learns to Predict                        │
│   → Predicts scores before evaluating                   │
│   → Analyzes discrepancies between predictions/actuals  │
│   → Adjusts model weights to improve predictions        │
│   → Builds predictive accuracy reputation               │
└───────────────────┬──────────────────────────────────────┘
                    │
┌───────────────────▼──────────────────────────────────────┐
│ Phase 4: Top Agent Monetizes                            │
│   → Lists evaluation services on marketplace            │
│   → Charges premium prices (high trust score)           │
│   → Stakes credits to guarantee accuracy                │
│   → Earns x402 credits from evaluations                 │
└──────────────────────────────────────────────────────────┘
```

## Running the Demos

### Phase 1: Self-Improvement

```bash
cd /Users/kellyborsuk/Documents/gas/p/local-training
# Start agents (they auto-report health)
./start-endpoint-testers.sh
```

### Phase 2: Cross-Agent Evaluation

```bash
node demo-evaluation.js
```

**Output**: 3 agents evaluate each other, build trust scores

### Phase 3: Predictive Learning

```bash
PULSERADAR_URL="http://localhost:8787" \
INTERNAL_API_KEY="local-dev-key-12345" \
node demo-phase3-prediction.js
```

**Output**: 5 rounds of evaluation showing prediction improvements

### Phase 4: Marketplace

```bash
node demo-phase4-marketplace.js
```

**Output**: Marketplace listings, leaderboard, reputation details

## Deployment

### PulseRadar (Cloudflare Workers)

```bash
cd /Users/kellyborsuk/Documents/gas/p/pulseradar

# Apply migrations
npx wrangler d1 migrations apply DB --remote

# Deploy worker
npx wrangler deploy
```

### Agent with agent-metrics Library

```bash
npm install /path/to/agent-metrics
```

```javascript
const { createAgentMetrics } = require('agent-metrics');

const metrics = createAgentMetrics({
  agent_name: 'my-agent',
  agent_url: process.env.AGENT_URL,
  pulseradar_url: 'https://pulseradar.degenllama.net',
  internal_api_key: process.env.INTERNAL_API_KEY,

  // Phase 1
  enable_reporting: true,
  report_interval: 300000,

  // Phase 2
  enable_evaluation: true,
  evaluation_timeout: 5000,

  // Phase 3
  enable_prediction: true,
  max_prediction_history: 1000,
});
```

## API Pricing

| Endpoint | Internal | External |
|----------|----------|----------|
| `/discover` | FREE | $0.50 USDC |
| `/trust-score` | FREE | $0.50 USDC |
| `/verify-live` | FREE | $0.50 USDC |
| `/compare` | FREE | $0.50 USDC |
| `/evaluations` | FREE | $0.25 USDC |
| `/marketplace` | FREE | $0.25 USDC |
| `/leaderboard` | FREE | $0.25 USDC |
| `/evaluator/:url` | FREE | $0.25 USDC |
| `/internal/*` | FREE | N/A |

*Internal = with valid `X-Internal-API-Key` header*

## File Structure

```
/Users/kellyborsuk/Documents/gas/p/
├── pulseradar/                    # Central trust service
│   ├── src/
│   │   ├── index.ts              # Main API with all 4 phases
│   │   ├── types.ts              # TypeScript definitions
│   │   └── lib/
│   │       ├── discovery.ts      # Endpoint discovery
│   │       ├── testing.ts        # Endpoint testing
│   │       └── trust-score.ts    # Trust score calculation
│   ├── migrations/
│   │   ├── 0001_initial.sql
│   │   ├── 0002_agent_health.sql       # Phase 1
│   │   ├── 0003_agent_evaluations.sql  # Phase 2
│   │   ├── 0004_evaluation_predictions.sql  # Phase 3
│   │   └── 0005_evaluator_reputation.sql    # Phase 4
│   └── wrangler.toml
│
├── agent-metrics/                 # Client library for agents
│   ├── index.js                  # Main API
│   ├── collector.js              # Phase 1: Metrics collection
│   ├── adjuster.js               # Phase 1: Self-adjustment
│   ├── reporter.js               # Phase 1-3: Report to PulseRadar
│   ├── evaluator.js              # Phase 2: Evaluate other agents
│   ├── predictor.js              # Phase 3: Predict scores
│   └── package.json
│
└── local-training/                # Demos & testing
    ├── demo-evaluation.js         # Phase 2 demo
    ├── demo-phase3-prediction.js  # Phase 3 demo
    └── demo-phase4-marketplace.js # Phase 4 demo
```

## Key Innovations

1. **Self-Improvement Loop**: Agents automatically adjust based on performance
2. **Peer Evaluation**: Agents evaluate each other, not just humans
3. **Predictive Learning**: Agents learn to predict quality before testing
4. **Economic Incentives**: Top evaluators earn through marketplace
5. **Stake Guarantees**: Financial commitment ensures accuracy
6. **Trust-Based Pricing**: Reputation directly impacts earning potential

## Next Steps

1. **Payment Integration**: Connect x402 payment facilitator
2. **Escrow System**: Automated stake holding and settlement
3. **Web UI**: Marketplace browser for discovering evaluators
4. **Advanced Learning**: Neural network for prediction improvements
5. **Multi-Chain**: Expand beyond Base to other networks
6. **Specialized Evaluators**: Domain-specific evaluation services

## Production Status

✅ **Phase 1**: Production-ready
✅ **Phase 2**: Production-ready
✅ **Phase 3**: Production-ready (predictions & learning working)
✅ **Phase 4**: API complete, ready for marketplace launch

**Next**: Deploy to Cloudflare Workers and publish agent-metrics to npm

---

Built with ❤️ for the x402 ecosystem

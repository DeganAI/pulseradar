-- Evaluator Reputation & Marketplace (Phase 4)
-- Tracks evaluator performance, reputation, and marketplace listings

-- Evaluator profiles and reputation
CREATE TABLE IF NOT EXISTS evaluators (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  evaluator_url TEXT UNIQUE NOT NULL,
  evaluator_name TEXT,
  description TEXT,
  registered_at INTEGER NOT NULL,
  last_active_at INTEGER NOT NULL,

  -- Reputation metrics
  trust_score INTEGER DEFAULT 500, -- 0-1000, starts at 500
  prediction_accuracy_rate REAL DEFAULT 0.0, -- 0.0 to 1.0
  calibration_score REAL DEFAULT 0.0, -- How well confidence matches accuracy
  consistency_score REAL DEFAULT 0.0, -- Low variance = high consistency
  total_evaluations INTEGER DEFAULT 0,
  total_predictions INTEGER DEFAULT 0,

  -- Performance stats
  avg_absolute_error REAL DEFAULT 0.0,
  grade_accuracy_rate REAL DEFAULT 0.0,
  avg_confidence REAL DEFAULT 0.0,

  -- Marketplace info
  is_marketplace_listed BOOLEAN DEFAULT FALSE,
  price_per_evaluation TEXT, -- JSON with prices for different test levels
  accepts_stakes BOOLEAN DEFAULT FALSE,
  min_stake_amount REAL DEFAULT 0.0,

  -- Contact & metadata
  contact_info TEXT, -- JSON with email, discord, etc
  specializations TEXT, -- JSON array of agent types they specialize in
  available BOOLEAN DEFAULT TRUE,

  -- Economic stats
  total_earned REAL DEFAULT 0.0,
  total_staked REAL DEFAULT 0.0,
  total_rewards REAL DEFAULT 0.0,
  total_penalties REAL DEFAULT 0.0
);

-- Marketplace listings
CREATE TABLE IF NOT EXISTS marketplace_listings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  evaluator_id INTEGER NOT NULL,
  listed_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,

  -- Offering details
  service_name TEXT NOT NULL,
  service_description TEXT,
  test_level TEXT NOT NULL, -- 'quick', 'comprehensive', 'custom'
  price_x402 REAL NOT NULL, -- Price in x402 credits
  estimated_time_minutes INTEGER,

  -- Requirements
  requires_stake BOOLEAN DEFAULT FALSE,
  stake_amount_x402 REAL DEFAULT 0.0,
  confidence_threshold REAL, -- Minimum confidence for stake

  -- Guarantees
  accuracy_guarantee REAL, -- Guaranteed max error, or refund
  response_time_guarantee_minutes INTEGER,

  -- Status
  is_active BOOLEAN DEFAULT TRUE,
  slots_available INTEGER DEFAULT -1, -- -1 = unlimited

  FOREIGN KEY (evaluator_id) REFERENCES evaluators(id) ON DELETE CASCADE
);

-- Evaluation requests & orders
CREATE TABLE IF NOT EXISTS evaluation_orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  listing_id INTEGER NOT NULL,
  evaluator_id INTEGER NOT NULL,
  requester_url TEXT NOT NULL,
  target_agent_url TEXT NOT NULL,

  -- Order details
  created_at INTEGER NOT NULL,
  status TEXT NOT NULL, -- 'pending', 'accepted', 'in_progress', 'completed', 'disputed', 'refunded'

  -- Payment & stakes
  price_paid_x402 REAL NOT NULL,
  stake_held_x402 REAL DEFAULT 0.0,
  escrow_address TEXT,

  -- Results
  prediction_id INTEGER,
  evaluation_id INTEGER,
  completed_at INTEGER,

  -- Settlement
  payout_amount_x402 REAL DEFAULT 0.0,
  refund_amount_x402 REAL DEFAULT 0.0,
  settled_at INTEGER,

  FOREIGN KEY (listing_id) REFERENCES marketplace_listings(id),
  FOREIGN KEY (evaluator_id) REFERENCES evaluators(id),
  FOREIGN KEY (prediction_id) REFERENCES evaluation_predictions(id),
  FOREIGN KEY (evaluation_id) REFERENCES agent_evaluations(id)
);

-- Reputation history (snapshots over time)
CREATE TABLE IF NOT EXISTS evaluator_reputation_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  evaluator_id INTEGER NOT NULL,
  snapshot_timestamp INTEGER NOT NULL,

  -- Snapshot of reputation at this time
  trust_score INTEGER NOT NULL,
  prediction_accuracy_rate REAL NOT NULL,
  calibration_score REAL NOT NULL,
  consistency_score REAL NOT NULL,
  total_evaluations INTEGER NOT NULL,

  -- What changed
  change_reason TEXT, -- 'accurate_prediction', 'poor_prediction', 'stake_win', 'stake_loss', etc.
  score_change INTEGER, -- +/- trust score change

  FOREIGN KEY (evaluator_id) REFERENCES evaluators(id) ON DELETE CASCADE
);

-- Stakes & rewards tracking
CREATE TABLE IF NOT EXISTS evaluation_stakes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL,
  evaluator_id INTEGER NOT NULL,
  staked_at INTEGER NOT NULL,

  -- Stake details
  stake_amount_x402 REAL NOT NULL,
  predicted_score INTEGER NOT NULL,
  confidence_level REAL NOT NULL,

  -- Outcome
  actual_score INTEGER,
  won BOOLEAN,
  settled_at INTEGER,
  reward_amount_x402 REAL DEFAULT 0.0,
  penalty_amount_x402 REAL DEFAULT 0.0,

  FOREIGN KEY (order_id) REFERENCES evaluation_orders(id),
  FOREIGN KEY (evaluator_id) REFERENCES evaluators(id)
);

-- Indexes for efficient marketplace queries
CREATE INDEX IF NOT EXISTS idx_evaluators_trust_score ON evaluators(trust_score DESC);
CREATE INDEX IF NOT EXISTS idx_evaluators_marketplace ON evaluators(is_marketplace_listed, available);
CREATE INDEX IF NOT EXISTS idx_evaluators_url ON evaluators(evaluator_url);

CREATE INDEX IF NOT EXISTS idx_listings_active ON marketplace_listings(is_active, price_x402);
CREATE INDEX IF NOT EXISTS idx_listings_evaluator ON marketplace_listings(evaluator_id);

CREATE INDEX IF NOT EXISTS idx_orders_status ON evaluation_orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_evaluator ON evaluation_orders(evaluator_id);
CREATE INDEX IF NOT EXISTS idx_orders_requester ON evaluation_orders(requester_url);

CREATE INDEX IF NOT EXISTS idx_reputation_history_evaluator ON evaluator_reputation_history(evaluator_id, snapshot_timestamp);

CREATE INDEX IF NOT EXISTS idx_stakes_evaluator ON evaluation_stakes(evaluator_id);
CREATE INDEX IF NOT EXISTS idx_stakes_order ON evaluation_stakes(order_id);

-- Views for marketplace discovery

-- Top evaluators leaderboard
CREATE VIEW IF NOT EXISTS evaluator_leaderboard AS
SELECT
  e.id,
  e.evaluator_url,
  e.evaluator_name,
  e.trust_score,
  e.prediction_accuracy_rate,
  e.total_evaluations,
  e.avg_absolute_error,
  e.grade_accuracy_rate,
  e.total_earned,
  RANK() OVER (ORDER BY e.trust_score DESC) as rank
FROM evaluators e
WHERE e.is_marketplace_listed = TRUE
  AND e.available = TRUE
ORDER BY e.trust_score DESC;

-- Active marketplace listings with evaluator reputation
CREATE VIEW IF NOT EXISTS marketplace_listings_with_reputation AS
SELECT
  l.*,
  e.evaluator_name,
  e.trust_score,
  e.prediction_accuracy_rate,
  e.total_evaluations,
  e.avg_absolute_error
FROM marketplace_listings l
JOIN evaluators e ON l.evaluator_id = e.id
WHERE l.is_active = TRUE
ORDER BY e.trust_score DESC, l.price_x402 ASC;

-- Evaluator performance summary
CREATE VIEW IF NOT EXISTS evaluator_performance_summary AS
SELECT
  e.id,
  e.evaluator_url,
  e.evaluator_name,
  e.trust_score,
  e.prediction_accuracy_rate,
  e.calibration_score,
  e.consistency_score,
  e.total_evaluations,
  e.total_predictions,
  e.avg_absolute_error,
  e.grade_accuracy_rate,
  COUNT(DISTINCT o.id) as total_orders,
  SUM(CASE WHEN o.status = 'completed' THEN 1 ELSE 0 END) as completed_orders,
  e.total_earned,
  e.total_rewards - e.total_penalties as net_rewards
FROM evaluators e
LEFT JOIN evaluation_orders o ON e.id = o.evaluator_id
GROUP BY e.id;

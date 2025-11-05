-- PulseRadar D1 Database Schema
-- Initial migration for endpoint discovery and trust scoring

-- Endpoints table: stores discovered x402 endpoints
CREATE TABLE IF NOT EXISTS endpoints (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  url TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  author TEXT,
  organization TEXT,
  framework TEXT,

  -- Endpoint categories
  category TEXT, -- e.g., "data", "defi", "analytics"
  tags TEXT, -- JSON array of tags

  -- Discovery metadata
  discovered_at INTEGER NOT NULL, -- Unix timestamp
  last_seen_at INTEGER NOT NULL, -- Unix timestamp
  discovery_source TEXT NOT NULL, -- "x402scan", "github", "manual"

  -- Status
  is_active BOOLEAN DEFAULT 1,
  last_checked_at INTEGER, -- Unix timestamp of last test

  -- Payment info
  default_price REAL, -- Default price in USDC
  payment_address TEXT,
  payment_network TEXT, -- "base", "ethereum", etc.

  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  updated_at INTEGER DEFAULT (strftime('%s', 'now'))
);

-- Endpoint tests table: stores results of endpoint tests
CREATE TABLE IF NOT EXISTS endpoint_tests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  endpoint_id INTEGER NOT NULL,

  -- Test results
  test_timestamp INTEGER NOT NULL, -- Unix timestamp
  status_code INTEGER,
  response_time_ms INTEGER,
  is_successful BOOLEAN,
  error_message TEXT,

  -- Response data (for validation)
  response_sample TEXT, -- JSON sample of response

  FOREIGN KEY (endpoint_id) REFERENCES endpoints(id) ON DELETE CASCADE
);

-- Trust scores table: calculated trust scores for endpoints
CREATE TABLE IF NOT EXISTS trust_scores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  endpoint_id INTEGER NOT NULL UNIQUE,

  -- Individual scores (0-100)
  uptime_score REAL NOT NULL DEFAULT 0,
  speed_score REAL NOT NULL DEFAULT 0,
  accuracy_score REAL NOT NULL DEFAULT 0,
  age_score REAL NOT NULL DEFAULT 0,

  -- Overall TrustScore (0-100)
  overall_score REAL NOT NULL DEFAULT 0,

  -- Letter grade
  grade TEXT NOT NULL DEFAULT 'F', -- A+, A, A-, B+, B, B-, C+, C, C-, D, F

  -- Recommendation
  recommendation TEXT NOT NULL DEFAULT 'AVOID', -- TRUSTED, CAUTION, AVOID

  -- Statistics for score calculation
  total_tests INTEGER DEFAULT 0,
  successful_tests INTEGER DEFAULT 0,
  failed_tests INTEGER DEFAULT 0,
  avg_response_time_ms REAL DEFAULT 0,

  -- Timestamps
  first_tested_at INTEGER,
  last_calculated_at INTEGER NOT NULL,

  FOREIGN KEY (endpoint_id) REFERENCES endpoints(id) ON DELETE CASCADE
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_endpoints_url ON endpoints(url);
CREATE INDEX IF NOT EXISTS idx_endpoints_active ON endpoints(is_active);
CREATE INDEX IF NOT EXISTS idx_endpoints_discovered_at ON endpoints(discovered_at);
CREATE INDEX IF NOT EXISTS idx_endpoint_tests_endpoint_id ON endpoint_tests(endpoint_id);
CREATE INDEX IF NOT EXISTS idx_endpoint_tests_timestamp ON endpoint_tests(test_timestamp);
CREATE INDEX IF NOT EXISTS idx_trust_scores_endpoint_id ON trust_scores(endpoint_id);
CREATE INDEX IF NOT EXISTS idx_trust_scores_overall_score ON trust_scores(overall_score);

-- Update trigger for endpoints.updated_at
CREATE TRIGGER IF NOT EXISTS update_endpoints_timestamp
AFTER UPDATE ON endpoints
BEGIN
  UPDATE endpoints SET updated_at = strftime('%s', 'now') WHERE id = NEW.id;
END;

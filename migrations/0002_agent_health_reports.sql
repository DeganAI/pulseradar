-- Agent Health Reports Migration
-- Stores health metrics reported by agents for self-improvement feedback loop

-- Agent health reports table: stores periodic health reports from agents
CREATE TABLE IF NOT EXISTS agent_health_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  -- Agent identification
  agent_url TEXT NOT NULL,
  agent_name TEXT NOT NULL,

  -- Report metadata
  report_timestamp INTEGER NOT NULL, -- Unix timestamp when report was sent
  received_at INTEGER DEFAULT (strftime('%s', 'now')),

  -- Performance metrics
  total_queries INTEGER DEFAULT 0,
  success_rate REAL DEFAULT 0, -- 0-1
  error_rate REAL DEFAULT 0, -- 0-1
  avg_response_time_ms REAL DEFAULT 0,
  p95_response_time_ms REAL DEFAULT 0,
  p99_response_time_ms REAL DEFAULT 0,

  -- Error breakdown (JSON)
  errors_by_type TEXT, -- JSON object like {"TIMEOUT": 5, "RATE_LIMIT": 2}

  -- Self-adjustments made (JSON array)
  adjustments TEXT, -- JSON array of adjustments made

  -- Health status
  health_status TEXT NOT NULL, -- EXCELLENT, GOOD, FAIR, POOR, CRITICAL

  -- Link to endpoint if discovered
  endpoint_id INTEGER,

  FOREIGN KEY (endpoint_id) REFERENCES endpoints(id) ON DELETE SET NULL
);

-- Indexes for querying
CREATE INDEX IF NOT EXISTS idx_health_reports_agent_url ON agent_health_reports(agent_url);
CREATE INDEX IF NOT EXISTS idx_health_reports_timestamp ON agent_health_reports(report_timestamp);
CREATE INDEX IF NOT EXISTS idx_health_reports_health_status ON agent_health_reports(health_status);
CREATE INDEX IF NOT EXISTS idx_health_reports_endpoint_id ON agent_health_reports(endpoint_id);

-- Agent health summary view (latest metrics per agent)
CREATE VIEW IF NOT EXISTS agent_health_summary AS
SELECT
  agent_url,
  agent_name,
  MAX(report_timestamp) as last_report_timestamp,
  health_status as current_health_status,
  success_rate as current_success_rate,
  avg_response_time_ms as current_avg_response_time,
  total_queries,
  endpoint_id
FROM agent_health_reports
WHERE id IN (
  SELECT MAX(id)
  FROM agent_health_reports
  GROUP BY agent_url
)
GROUP BY agent_url;

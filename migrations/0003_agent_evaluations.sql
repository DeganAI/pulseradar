-- Agent Evaluations Migration
-- Stores evaluation results when agents test other agents (Phase 2)

-- Agent evaluations table: stores test results from cross-agent evaluation
CREATE TABLE IF NOT EXISTS agent_evaluations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  -- Evaluator identification (who did the evaluation)
  evaluator_url TEXT NOT NULL,
  evaluator_name TEXT,

  -- Target identification (who was evaluated)
  target_url TEXT NOT NULL,
  target_name TEXT,

  -- Evaluation metadata
  evaluation_timestamp INTEGER NOT NULL, -- Unix timestamp
  test_level TEXT NOT NULL, -- 'quick' or 'comprehensive'
  total_tests INTEGER NOT NULL,
  total_time_ms INTEGER NOT NULL,

  -- Overall scores
  score INTEGER NOT NULL, -- 0-100
  grade TEXT NOT NULL, -- A, B, C, D, F
  recommendation TEXT NOT NULL, -- HIGHLY_RECOMMENDED, RECOMMENDED, USE_WITH_CAUTION, AVOID

  -- Category performance (JSON)
  strengths TEXT, -- JSON array: ["crypto_price (95%)", "error_handling (100%)"]
  weaknesses TEXT, -- JSON array: ["performance (45%)"]

  -- Detailed test results (JSON array)
  test_results TEXT NOT NULL, -- Full test results with pass/fail/scores

  -- Link to endpoint if discovered
  target_endpoint_id INTEGER,

  FOREIGN KEY (target_endpoint_id) REFERENCES endpoints(id) ON DELETE SET NULL
);

-- Indexes for querying
CREATE INDEX IF NOT EXISTS idx_evaluations_evaluator_url ON agent_evaluations(evaluator_url);
CREATE INDEX IF NOT EXISTS idx_evaluations_target_url ON agent_evaluations(target_url);
CREATE INDEX IF NOT EXISTS idx_evaluations_timestamp ON agent_evaluations(evaluation_timestamp);
CREATE INDEX IF NOT EXISTS idx_evaluations_score ON agent_evaluations(score);
CREATE INDEX IF NOT EXISTS idx_evaluations_grade ON agent_evaluations(grade);
CREATE INDEX IF NOT EXISTS idx_evaluations_target_endpoint_id ON agent_evaluations(target_endpoint_id);

-- Agent evaluation summary view (latest evaluation per target agent)
CREATE VIEW IF NOT EXISTS agent_evaluation_summary AS
SELECT
  target_url,
  target_name,
  COUNT(*) as total_evaluations,
  AVG(score) as avg_score,
  MAX(evaluation_timestamp) as last_evaluation_timestamp,
  grade as latest_grade,
  recommendation as latest_recommendation,
  target_endpoint_id
FROM agent_evaluations
WHERE id IN (
  SELECT MAX(id)
  FROM agent_evaluations
  GROUP BY target_url
)
GROUP BY target_url;

-- Evaluator reputation view (tracks which agents are good evaluators)
CREATE VIEW IF NOT EXISTS evaluator_reputation AS
SELECT
  evaluator_url,
  evaluator_name,
  COUNT(*) as evaluations_performed,
  AVG(total_tests) as avg_tests_per_evaluation,
  MAX(evaluation_timestamp) as last_evaluation_timestamp
FROM agent_evaluations
GROUP BY evaluator_url
ORDER BY evaluations_performed DESC;

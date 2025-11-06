-- Evaluation Predictions Migration (Phase 3)
-- Tracks predictions before evaluation, compares to actual results, and learns from discrepancies

-- Prediction records: What the evaluator predicts before running tests
CREATE TABLE IF NOT EXISTS evaluation_predictions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  evaluator_url TEXT NOT NULL,
  evaluator_name TEXT,
  target_url TEXT NOT NULL,
  target_name TEXT,
  prediction_timestamp INTEGER NOT NULL,

  -- Prediction data
  predicted_score INTEGER NOT NULL,
  predicted_grade TEXT NOT NULL,
  confidence_level REAL NOT NULL, -- 0.0 to 1.0
  prediction_basis TEXT NOT NULL, -- 'historical', 'pattern', 'metadata', 'combined'

  -- What the prediction is based on
  historical_data_points INTEGER DEFAULT 0,
  similar_agents_analyzed INTEGER DEFAULT 0,
  features_analyzed TEXT, -- JSON array of features considered

  -- Link to actual evaluation when it happens
  actual_evaluation_id INTEGER,

  FOREIGN KEY (actual_evaluation_id) REFERENCES agent_evaluations(id) ON DELETE SET NULL
);

-- Prediction discrepancies: Comparison of prediction vs actual
CREATE TABLE IF NOT EXISTS prediction_discrepancies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  prediction_id INTEGER NOT NULL,
  evaluation_id INTEGER NOT NULL,
  evaluator_url TEXT NOT NULL,
  target_url TEXT NOT NULL,
  analysis_timestamp INTEGER NOT NULL,

  -- Discrepancy metrics
  predicted_score INTEGER NOT NULL,
  actual_score INTEGER NOT NULL,
  score_difference INTEGER NOT NULL, -- actual - predicted
  absolute_error INTEGER NOT NULL, -- |actual - predicted|

  predicted_grade TEXT NOT NULL,
  actual_grade TEXT NOT NULL,
  grade_match BOOLEAN NOT NULL,

  -- Detailed analysis
  confidence_was REAL NOT NULL,
  prediction_basis_was TEXT NOT NULL,

  -- Test-level discrepancies (JSON)
  test_discrepancies TEXT, -- Which specific tests were most off

  -- Learning insights
  accuracy_category TEXT NOT NULL, -- 'excellent' (<5 error), 'good' (<10), 'fair' (<20), 'poor' (>=20)
  overestimated BOOLEAN NOT NULL, -- true if predicted > actual

  FOREIGN KEY (prediction_id) REFERENCES evaluation_predictions(id) ON DELETE CASCADE,
  FOREIGN KEY (evaluation_id) REFERENCES agent_evaluations(id) ON DELETE CASCADE
);

-- Evaluator learning metrics: Track how evaluators improve over time
CREATE TABLE IF NOT EXISTS evaluator_learning_metrics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  evaluator_url TEXT NOT NULL,
  window_start INTEGER NOT NULL,
  window_end INTEGER NOT NULL,

  -- Prediction accuracy over this window
  total_predictions INTEGER NOT NULL,
  avg_absolute_error REAL NOT NULL,
  median_absolute_error REAL NOT NULL,
  grade_accuracy_rate REAL NOT NULL, -- % of correct grade predictions

  -- Confidence calibration
  avg_confidence REAL NOT NULL,
  confidence_vs_accuracy_correlation REAL, -- How well confidence matches actual accuracy

  -- Improvement trends
  error_trend TEXT, -- 'improving', 'stable', 'declining'
  learning_rate REAL, -- Rate of improvement

  -- Current model parameters (JSON)
  model_weights TEXT, -- Test weights and adjustment factors

  created_at INTEGER NOT NULL,

  UNIQUE(evaluator_url, window_start, window_end)
);

-- Test weight adjustments: Learn which tests are most predictive
CREATE TABLE IF NOT EXISTS test_weight_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  evaluator_url TEXT NOT NULL,
  adjustment_timestamp INTEGER NOT NULL,

  -- What changed
  test_category TEXT NOT NULL, -- e.g., 'crypto_price', 'consistency', 'error_handling'
  old_weight REAL NOT NULL,
  new_weight REAL NOT NULL,

  -- Why it changed
  reason TEXT NOT NULL,
  correlation_with_success REAL, -- How much this test correlates with actual agent quality

  -- Impact
  expected_improvement REAL, -- Expected reduction in prediction error

  FOREIGN KEY (evaluator_url) REFERENCES evaluation_predictions(evaluator_url)
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_predictions_evaluator ON evaluation_predictions(evaluator_url);
CREATE INDEX IF NOT EXISTS idx_predictions_target ON evaluation_predictions(target_url);
CREATE INDEX IF NOT EXISTS idx_predictions_timestamp ON evaluation_predictions(prediction_timestamp);
CREATE INDEX IF NOT EXISTS idx_predictions_actual_eval ON evaluation_predictions(actual_evaluation_id);

CREATE INDEX IF NOT EXISTS idx_discrepancies_prediction ON prediction_discrepancies(prediction_id);
CREATE INDEX IF NOT EXISTS idx_discrepancies_evaluation ON prediction_discrepancies(evaluation_id);
CREATE INDEX IF NOT EXISTS idx_discrepancies_evaluator ON prediction_discrepancies(evaluator_url);
CREATE INDEX IF NOT EXISTS idx_discrepancies_accuracy ON prediction_discrepancies(accuracy_category);

CREATE INDEX IF NOT EXISTS idx_learning_metrics_evaluator ON evaluator_learning_metrics(evaluator_url);
CREATE INDEX IF NOT EXISTS idx_learning_metrics_window ON evaluator_learning_metrics(window_start, window_end);

CREATE INDEX IF NOT EXISTS idx_weight_history_evaluator ON test_weight_history(evaluator_url);
CREATE INDEX IF NOT EXISTS idx_weight_history_timestamp ON test_weight_history(adjustment_timestamp);
CREATE INDEX IF NOT EXISTS idx_weight_history_category ON test_weight_history(test_category);

-- Views for analytics

-- Latest prediction accuracy per evaluator
CREATE VIEW IF NOT EXISTS evaluator_prediction_accuracy AS
SELECT
  evaluator_url,
  COUNT(*) as total_predictions,
  AVG(absolute_error) as avg_error,
  AVG(CASE WHEN grade_match THEN 1.0 ELSE 0.0 END) as grade_accuracy,
  AVG(confidence_was) as avg_confidence,
  SUM(CASE WHEN accuracy_category = 'excellent' THEN 1 ELSE 0 END) as excellent_predictions,
  SUM(CASE WHEN accuracy_category = 'good' THEN 1 ELSE 0 END) as good_predictions,
  SUM(CASE WHEN accuracy_category = 'fair' THEN 1 ELSE 0 END) as fair_predictions,
  SUM(CASE WHEN accuracy_category = 'poor' THEN 1 ELSE 0 END) as poor_predictions
FROM prediction_discrepancies
GROUP BY evaluator_url;

-- Prediction improvement trends
CREATE VIEW IF NOT EXISTS evaluator_improvement_trends AS
SELECT
  evaluator_url,
  error_trend,
  learning_rate,
  avg_absolute_error as current_avg_error,
  grade_accuracy_rate as current_grade_accuracy,
  total_predictions,
  created_at as last_updated
FROM evaluator_learning_metrics
WHERE id IN (
  SELECT MAX(id)
  FROM evaluator_learning_metrics
  GROUP BY evaluator_url
);

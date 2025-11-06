/**
 * Type definitions for PulseRadar
 */

// Cloudflare Workers environment bindings
export interface Env {
  DB: D1Database;
  INTERNAL_API_KEY: string;
  FACILITATOR_URL?: string;
  X402_PROXY_URL?: string; // Payment proxy service URL
  X402_PROXY_API_KEY?: string; // API key for payment proxy
  ENVIRONMENT: string;
}

// Endpoint from database
export interface Endpoint {
  id: number;
  url: string;
  name: string;
  description?: string;
  author?: string;
  organization?: string;
  framework?: string;
  category?: string;
  tags?: string; // JSON array
  discovered_at: number;
  last_seen_at: number;
  discovery_source: string;
  is_active: boolean;
  last_checked_at?: number;
  default_price?: number;
  payment_address?: string;
  payment_network?: string;
  created_at: number;
  updated_at: number;
}

// Endpoint test result
export interface EndpointTest {
  id?: number;
  endpoint_id: number;
  test_timestamp: number;
  status_code?: number;
  response_time_ms?: number;
  is_successful: boolean;
  error_message?: string;
  response_sample?: string; // JSON
}

// Trust score
export interface TrustScore {
  id?: number;
  endpoint_id: number;
  uptime_score: number;
  speed_score: number;
  accuracy_score: number;
  age_score: number;
  overall_score: number;
  grade: string;
  recommendation: 'TRUSTED' | 'CAUTION' | 'AVOID';
  total_tests: number;
  successful_tests: number;
  failed_tests: number;
  avg_response_time_ms: number;
  first_tested_at?: number;
  last_calculated_at: number;
}

// x402 agent manifest format
export interface AgentManifest {
  name: string;
  version: string;
  description: string;
  author?: string;
  organization?: string;
  provider?: string;
  framework?: string;
  entrypoints?: Record<string, EntrypointInfo>;
  payments?: {
    facilitatorUrl?: string;
    payTo?: string;
    network?: string;
    asset?: string;
    defaultPrice?: string;
  };
}

export interface EntrypointInfo {
  key: string;
  description?: string;
  price?: string;
  inputSchema?: any;
  outputSchema?: any;
}

// Discovery result from x402scan or GitHub
export interface DiscoveryResult {
  url: string;
  name: string;
  description?: string;
  author?: string;
  organization?: string;
  source: 'x402_index' | 'seed_list' | 'x402_ecosystem' | 'github' | 'manual';
}

// API Request/Response types

export interface DiscoverRequest {
  category?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

export interface DiscoverResponse {
  endpoints: Array<{
    url: string;
    name: string;
    description?: string;
    author?: string;
    organization?: string;
    category?: string;
    trust_score?: number;
    grade?: string;
  }>;
  total: number;
  limit: number;
  offset: number;
}

export interface TrustScoreRequest {
  endpoint_url: string;
}

export interface TrustScoreResponse {
  endpoint: string;
  trust_score: {
    overall: number;
    uptime: number;
    speed: number;
    accuracy: number;
    age: number;
    grade: string;
    recommendation: 'TRUSTED' | 'CAUTION' | 'AVOID';
  };
  stats: {
    total_tests: number;
    successful_tests: number;
    avg_response_time_ms: number;
    last_tested: string;
  };
  last_updated: string;
}

export interface VerifyLiveRequest {
  endpoint_url: string;
  test_query?: any;
}

export interface VerifyLiveResponse {
  endpoint: string;
  test_result: {
    success: boolean;
    status_code?: number;
    response_time_ms?: number;
    error?: string;
  };
  trust_score: {
    overall: number;
    grade: string;
    recommendation: 'TRUSTED' | 'CAUTION' | 'AVOID';
  };
  tested_at: string;
}

export interface CompareEndpointsRequest {
  endpoint_urls: string[]; // 2-5 endpoints
}

export interface CompareEndpointsResponse {
  comparison: Array<{
    url: string;
    name: string;
    trust_score: number;
    grade: string;
    avg_response_time_ms: number;
    uptime_percentage: number;
    recommendation: string;
  }>;
  winner: {
    url: string;
    reason: string;
  };
  tested_at: string;
}

// Cron job event from Cloudflare
export interface ScheduledEvent {
  cron: string;
  scheduledTime: number;
}

// Agent Health Reports (self-improvement feedback loop)

export interface AgentHealthReport {
  id?: number;
  agent_url: string;
  agent_name: string;
  report_timestamp: number;
  received_at?: number;

  // Performance metrics
  total_queries: number;
  success_rate: number;
  error_rate: number;
  avg_response_time_ms: number;
  p95_response_time_ms: number;
  p99_response_time_ms: number;

  // Error breakdown
  errors_by_type: Record<string, number>;

  // Self-adjustments
  adjustments: Array<{
    type: string;
    parameter: string;
    old_value: any;
    new_value: any;
    reason: string;
  }>;

  // Health status
  health_status: 'EXCELLENT' | 'GOOD' | 'FAIR' | 'POOR' | 'CRITICAL';

  endpoint_id?: number;
}

export interface AgentHealthReportRequest {
  agent_url: string;
  agent_name: string;
  timestamp: number;
  metrics: {
    total_queries: number;
    success_rate: number;
    error_rate: number;
    avg_response_time: number;
    p95_response_time: number;
    p99_response_time: number;
    errors_by_type: Record<string, number>;
  };
  adjustments: Array<{
    type: string;
    parameter: string;
    old_value: any;
    new_value: any;
    reason: string;
  }>;
  health_status: 'EXCELLENT' | 'GOOD' | 'FAIR' | 'POOR' | 'CRITICAL';
}

export interface AgentHealthReportResponse {
  success: boolean;
  message: string;
  report_id: number;
  feedback?: {
    recommendation?: string;
    suggested_optimizations?: string[];
  };
}

// Agent Evaluation Types (Phase 2 - Cross-Agent Evaluation)

export interface AgentEvaluation {
  id?: number;
  evaluator_url: string;
  evaluator_name?: string;
  target_url: string;
  target_name?: string;
  evaluation_timestamp: number;
  test_level: 'quick' | 'comprehensive';
  total_tests: number;
  total_time_ms: number;
  score: number; // 0-100
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  recommendation: 'HIGHLY_RECOMMENDED' | 'RECOMMENDED' | 'USE' | 'USE_WITH_CAUTION' | 'AVOID';
  strengths: string[]; // JSON array
  weaknesses: string[]; // JSON array
  test_results: any[]; // JSON array of detailed test results
  target_endpoint_id?: number;
}

export interface AgentEvaluationRequest {
  evaluator_url: string;
  evaluator_name?: string;
  target_url: string;
  target_name?: string;
  timestamp: number;
  test_level: 'quick' | 'comprehensive';
  total_tests: number;
  total_time_ms: number;
  score: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  recommendation: 'HIGHLY_RECOMMENDED' | 'RECOMMENDED' | 'USE' | 'USE_WITH_CAUTION' | 'AVOID';
  strengths: string[];
  weaknesses: string[];
  test_results: any[];
}

export interface AgentEvaluationResponse {
  success: boolean;
  message: string;
  evaluation_id: number;
  feedback?: {
    message: string;
    trends?: string[];
  };
}

export interface GetEvaluationsRequest {
  target_url?: string;
  evaluator_url?: string;
  limit?: number;
  min_score?: number;
}

export interface GetEvaluationsResponse {
  evaluations: Array<{
    id: number;
    evaluator_url: string;
    target_url: string;
    target_name?: string;
    evaluation_timestamp: number;
    score: number;
    grade: string;
    recommendation: string;
    test_level: string;
  }>;
  summary?: {
    avg_score: number;
    total_evaluations: number;
    latest_grade: string;
  };
}

// Prediction Types (Phase 3 - Predictive Evaluation & Learning)

export interface EvaluationPredictionRequest {
  evaluator_url: string;
  evaluator_name?: string;
  target_url: string;
  target_name?: string;
  prediction_timestamp: number;
  predicted_score: number;
  predicted_grade: 'A' | 'B' | 'C' | 'D' | 'F';
  confidence_level: number; // 0.0 to 1.0
  prediction_basis: 'historical' | 'pattern' | 'metadata' | 'baseline' | 'combined';
  historical_data_points: number;
  similar_agents_analyzed: number;
  features_analyzed: string; // JSON array
  actual_evaluation_id?: number;
}

export interface EvaluationPredictionResponse {
  success: boolean;
  message: string;
  prediction_id: number;
}

export interface PredictionDiscrepancyRequest {
  evaluator_url: string;
  target_url: string;
  analysis_timestamp: number;
  predicted_score: number;
  actual_score: number;
  score_difference: number;
  absolute_error: number;
  predicted_grade: string;
  actual_grade: string;
  grade_match: boolean;
  confidence_was: number;
  prediction_basis_was: string;
  test_discrepancies: string; // JSON array
  accuracy_category: 'excellent' | 'good' | 'fair' | 'poor';
  overestimated: boolean;
}

export interface PredictionDiscrepancyResponse {
  success: boolean;
  message: string;
  discrepancy_id: number;
  learning_insights?: {
    evaluator_performance: string;
    suggested_adjustments?: string[];
  };
}

// Marketplace Types (Phase 4 - Reputation & Market Integration)

export interface EvaluatorProfile {
  id: number;
  evaluator_url: string;
  evaluator_name?: string;
  description?: string;
  trust_score: number; // 0-1000
  prediction_accuracy_rate: number;
  calibration_score: number;
  consistency_score: number;
  total_evaluations: number;
  total_predictions: number;
  avg_absolute_error: number;
  grade_accuracy_rate: number;
  is_marketplace_listed: boolean;
  available: boolean;
  rank?: number;
}

export interface MarketplaceListing {
  id: number;
  evaluator_id: number;
  evaluator_name?: string;
  trust_score: number;
  service_name: string;
  service_description?: string;
  test_level: 'quick' | 'comprehensive' | 'custom';
  price_x402: number;
  estimated_time_minutes?: number;
  requires_stake: boolean;
  stake_amount_x402: number;
  accuracy_guarantee?: number;
  response_time_guarantee_minutes?: number;
  is_active: boolean;
  slots_available: number;
}

export interface GetMarketplaceRequest {
  test_level?: 'quick' | 'comprehensive' | 'custom';
  min_trust_score?: number;
  max_price?: number;
  requires_stake?: boolean;
  limit?: number;
}

export interface GetMarketplaceResponse {
  listings: MarketplaceListing[];
  total_count: number;
}

export interface GetLeaderboardRequest {
  limit?: number;
  min_evaluations?: number;
}

export interface GetLeaderboardResponse {
  evaluators: EvaluatorProfile[];
}

export interface GetEvaluatorReputationRequest {
  evaluator_url: string;
}

export interface GetEvaluatorReputationResponse {
  evaluator: EvaluatorProfile;
  recent_evaluations: Array<{
    target_url: string;
    score: number;
    grade: string;
    timestamp: number;
  }>;
  prediction_stats: {
    total_predictions: number;
    avg_error: number;
    grade_accuracy: number;
    confidence_calibration: number;
  };
  trust_score_history: Array<{
    timestamp: number;
    trust_score: number;
    change_reason: string;
  }>;
}

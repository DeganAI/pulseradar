/**
 * Type definitions for PulseRadar
 */

// Cloudflare Workers environment bindings
export interface Env {
  DB: D1Database;
  INTERNAL_API_KEY: string;
  FACILITATOR_URL?: string;
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
  source: 'x402scan' | 'github' | 'manual';
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

/**
 * Testing Engine - Tests x402 endpoints and records performance
 */

import type { Env, Endpoint, EndpointTest } from '../types';

/**
 * Test a single endpoint
 */
export async function testEndpoint(endpoint: Endpoint): Promise<EndpointTest> {
  const startTime = Date.now();
  const testTimestamp = Math.floor(startTime / 1000);

  try {
    // Try to fetch the agent manifest
    const manifestUrl = endpoint.url.endsWith('/')
      ? `${endpoint.url}.well-known/agent.json`
      : `${endpoint.url}/.well-known/agent.json`;

    const response = await fetch(manifestUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'PulseRadar/1.0',
      },
      signal: AbortSignal.timeout(10000), // 10 second timeout
    });

    const responseTime = Date.now() - startTime;
    const statusCode = response.status;

    // Check if successful
    const isSuccessful = response.ok && statusCode === 200;

    let responseSample: string | undefined;
    if (isSuccessful) {
      try {
        const data = await response.json() as any;
        // Store a small sample of the response
        responseSample = JSON.stringify({
          name: data.name,
          version: data.version,
          description: data.description?.substring(0, 200),
        });
      } catch (e) {
        // Response wasn't JSON
      }
    }

    return {
      endpoint_id: endpoint.id,
      test_timestamp: testTimestamp,
      status_code: statusCode,
      response_time_ms: responseTime,
      is_successful: isSuccessful,
      error_message: isSuccessful ? undefined : `HTTP ${statusCode}`,
      response_sample: responseSample,
    };
  } catch (error: any) {
    const responseTime = Date.now() - startTime;

    return {
      endpoint_id: endpoint.id,
      test_timestamp: testTimestamp,
      status_code: 0,
      response_time_ms: responseTime,
      is_successful: false,
      error_message: error.message || 'Request failed',
    };
  }
}

/**
 * Save test result to database
 */
export async function saveTestResult(env: Env, test: EndpointTest): Promise<void> {
  try {
    await env.DB.prepare(`
      INSERT INTO endpoint_tests (
        endpoint_id, test_timestamp, status_code, response_time_ms,
        is_successful, error_message, response_sample
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(
      test.endpoint_id,
      test.test_timestamp,
      test.status_code || null,
      test.response_time_ms || null,
      test.is_successful ? 1 : 0,
      test.error_message || null,
      test.response_sample || null
    ).run();

    // Update last_checked_at on endpoint
    await env.DB.prepare(
      'UPDATE endpoints SET last_checked_at = ? WHERE id = ?'
    ).bind(test.test_timestamp, test.endpoint_id).run();
  } catch (error) {
    console.error(`Error saving test result for endpoint ${test.endpoint_id}:`, error);
  }
}

/**
 * Test all active endpoints
 */
export async function testAllEndpoints(env: Env, limit = 50): Promise<{
  total_tested: number;
  successful: number;
  failed: number;
}> {
  console.log('Starting endpoint testing...');

  // Get active endpoints that haven't been tested recently
  const cutoffTime = Math.floor(Date.now() / 1000) - (30 * 60); // 30 minutes ago

  const { results: endpoints } = await env.DB.prepare(`
    SELECT * FROM endpoints
    WHERE is_active = 1
    AND (last_checked_at IS NULL OR last_checked_at < ?)
    ORDER BY last_checked_at ASC NULLS FIRST
    LIMIT ?
  `).bind(cutoffTime, limit).all() as { results: Endpoint[] };

  console.log(`Testing ${endpoints.length} endpoints`);

  let successful = 0;
  let failed = 0;

  // Test endpoints in parallel (batches of 10)
  const batchSize = 10;
  for (let i = 0; i < endpoints.length; i += batchSize) {
    const batch = endpoints.slice(i, i + batchSize);

    const tests = await Promise.all(
      batch.map(endpoint => testEndpoint(endpoint))
    );

    // Save all test results
    await Promise.all(
      tests.map(test => {
        if (test.is_successful) {
          successful++;
        } else {
          failed++;
        }
        return saveTestResult(env, test);
      })
    );
  }

  console.log(`Testing complete: ${successful} successful, ${failed} failed`);

  return {
    total_tested: endpoints.length,
    successful,
    failed,
  };
}

/**
 * Get recent test results for an endpoint
 */
export async function getEndpointTests(
  env: Env,
  endpointId: number,
  limit = 100
): Promise<EndpointTest[]> {
  const { results } = await env.DB.prepare(`
    SELECT * FROM endpoint_tests
    WHERE endpoint_id = ?
    ORDER BY test_timestamp DESC
    LIMIT ?
  `).bind(endpointId, limit).all() as { results: EndpointTest[] };

  return results;
}

/**
 * Calculate uptime percentage from tests
 */
export function calculateUptime(tests: EndpointTest[]): number {
  if (tests.length === 0) return 0;

  const successful = tests.filter(t => t.is_successful).length;
  return (successful / tests.length) * 100;
}

/**
 * Calculate average response time from tests
 */
export function calculateAvgResponseTime(tests: EndpointTest[]): number {
  const successfulTests = tests.filter(t => t.is_successful && t.response_time_ms);

  if (successfulTests.length === 0) return 0;

  const total = successfulTests.reduce((sum, t) => sum + (t.response_time_ms || 0), 0);
  return total / successfulTests.length;
}

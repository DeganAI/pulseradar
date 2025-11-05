/**
 * PulseRadar - Endpoint Discovery and Trust Scoring for x402 Ecosystem
 * Cloudflare Workers + D1 Database
 */

import type {
  Env,
  DiscoverRequest,
  DiscoverResponse,
  TrustScoreRequest,
  TrustScoreResponse,
  VerifyLiveRequest,
  VerifyLiveResponse,
  CompareEndpointsRequest,
  CompareEndpointsResponse,
  ScheduledEvent,
  Endpoint,
  TrustScore,
} from './types';
import { runDiscovery } from './lib/discovery';
import { testAllEndpoints, testEndpoint } from './lib/testing';
import { calculateAllTrustScores, calculateTrustScoreForEndpoint } from './lib/trust-score';

/**
 * Check if request has valid internal API key
 */
function isInternalRequest(request: Request, env: Env): boolean {
  const apiKey = request.headers.get('X-Internal-API-Key');
  return apiKey === env.INTERNAL_API_KEY;
}

/**
 * Check if request has valid x402 payment
 */
async function hasValidPayment(request: Request, requiredAmount: number): Promise<boolean> {
  // Check for x402 payment headers
  const paymentProof = request.headers.get('X-Payment-Proof');
  const paymentAmount = request.headers.get('X-Payment-Amount');

  if (!paymentProof || !paymentAmount) {
    return false;
  }

  const amount = parseFloat(paymentAmount);
  if (amount < requiredAmount) {
    return false;
  }

  // TODO: Verify payment proof with facilitator
  // For now, we trust the header (in production, verify with facilitator)
  // const facilitatorUrl = env.FACILITATOR_URL || 'https://facilitator.daydreams.systems';
  // const verification = await fetch(`${facilitatorUrl}/verify`, {
  //   method: 'POST',
  //   body: JSON.stringify({ proof: paymentProof }),
  // });

  return true; // Simplified for alpha
}

/**
 * Handle /discover endpoint - List all discovered endpoints
 */
async function handleDiscover(request: Request, env: Env): Promise<Response> {
  try {
    // Check payment (FREE for internal, $0.50 for external)
    const isInternal = isInternalRequest(request, env);
    if (!isInternal) {
      const hasPayment = await hasValidPayment(request, 0.50);
      if (!hasPayment) {
        return new Response(JSON.stringify({
          error: 'Payment required: $0.50 USDC',
          details: 'Use x402 protocol headers: X-Payment-Proof, X-Payment-Amount',
        }), { status: 402, headers: { 'Content-Type': 'application/json' } });
      }
    }

    // Parse query params
    const url = new URL(request.url);
    const category = url.searchParams.get('category') || undefined;
    const search = url.searchParams.get('search') || undefined;
    const limit = parseInt(url.searchParams.get('limit') || '50');
    const offset = parseInt(url.searchParams.get('offset') || '0');

    // Query database
    let query = `
      SELECT
        e.url, e.name, e.description, e.author, e.organization, e.category,
        t.overall_score as trust_score, t.grade
      FROM endpoints e
      LEFT JOIN trust_scores t ON e.id = t.endpoint_id
      WHERE e.is_active = 1
    `;
    const params: any[] = [];

    if (category) {
      query += ` AND e.category = ?`;
      params.push(category);
    }

    if (search) {
      query += ` AND (e.name LIKE ? OR e.description LIKE ?)`;
      params.push(`%${search}%`, `%${search}%`);
    }

    query += ` ORDER BY t.overall_score DESC NULLS LAST LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const { results: endpoints } = await env.DB.prepare(query).bind(...params).all();

    // Get total count
    let countQuery = `SELECT COUNT(*) as total FROM endpoints WHERE is_active = 1`;
    const countParams: any[] = [];

    if (category) {
      countQuery += ` AND category = ?`;
      countParams.push(category);
    }
    if (search) {
      countQuery += ` AND (name LIKE ? OR description LIKE ?)`;
      countParams.push(`%${search}%`, `%${search}%`);
    }

    const totalResult = await env.DB.prepare(countQuery).bind(...countParams).first();
    const total = (totalResult as any)?.total || 0;

    const response: DiscoverResponse = {
      endpoints: endpoints as any[],
      total,
      limit,
      offset,
    };

    return new Response(JSON.stringify(response), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('Error in /discover:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

/**
 * Handle /trust-score endpoint - Get cached trust score for endpoint
 */
async function handleTrustScore(request: Request, env: Env): Promise<Response> {
  try {
    // Check payment (FREE for internal, $0.50 for external)
    const isInternal = isInternalRequest(request, env);
    if (!isInternal) {
      const hasPayment = await hasValidPayment(request, 0.50);
      if (!hasPayment) {
        return new Response(JSON.stringify({
          error: 'Payment required: $0.50 USDC',
        }), { status: 402, headers: { 'Content-Type': 'application/json' } });
      }
    }

    const body: TrustScoreRequest = await request.json();

    if (!body.endpoint_url) {
      return new Response(JSON.stringify({ error: 'endpoint_url is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Find endpoint
    const endpoint = await env.DB.prepare(
      'SELECT * FROM endpoints WHERE url = ?'
    ).bind(body.endpoint_url).first() as Endpoint | null;

    if (!endpoint) {
      return new Response(JSON.stringify({ error: 'Endpoint not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Get trust score
    const trustScore = await env.DB.prepare(
      'SELECT * FROM trust_scores WHERE endpoint_id = ?'
    ).bind(endpoint.id).first() as TrustScore | null;

    if (!trustScore) {
      return new Response(JSON.stringify({
        error: 'Trust score not yet calculated',
        hint: 'This endpoint has not been tested yet. Try again later or use /verify-live.',
      }), { status: 404, headers: { 'Content-Type': 'application/json' } });
    }

    const response: TrustScoreResponse = {
      endpoint: body.endpoint_url,
      trust_score: {
        overall: trustScore.overall_score,
        uptime: trustScore.uptime_score,
        speed: trustScore.speed_score,
        accuracy: trustScore.accuracy_score,
        age: trustScore.age_score,
        grade: trustScore.grade,
        recommendation: trustScore.recommendation,
      },
      stats: {
        total_tests: trustScore.total_tests,
        successful_tests: trustScore.successful_tests,
        avg_response_time_ms: trustScore.avg_response_time_ms,
        last_tested: new Date(trustScore.last_calculated_at * 1000).toISOString(),
      },
      last_updated: new Date(trustScore.last_calculated_at * 1000).toISOString(),
    };

    return new Response(JSON.stringify(response), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('Error in /trust-score:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

/**
 * Handle /verify-live endpoint - Run live test on endpoint
 */
async function handleVerifyLive(request: Request, env: Env): Promise<Response> {
  try {
    // Check payment (FREE for internal, $0.50 for external)
    const isInternal = isInternalRequest(request, env);
    if (!isInternal) {
      const hasPayment = await hasValidPayment(request, 0.50);
      if (!hasPayment) {
        return new Response(JSON.stringify({
          error: 'Payment required: $0.50 USDC',
        }), { status: 402, headers: { 'Content-Type': 'application/json' } });
      }
    }

    const body: VerifyLiveRequest = await request.json();

    if (!body.endpoint_url) {
      return new Response(JSON.stringify({ error: 'endpoint_url is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Find or create endpoint
    let endpoint = await env.DB.prepare(
      'SELECT * FROM endpoints WHERE url = ?'
    ).bind(body.endpoint_url).first() as Endpoint | null;

    if (!endpoint) {
      // Create new endpoint
      const now = Math.floor(Date.now() / 1000);
      const result = await env.DB.prepare(`
        INSERT INTO endpoints (url, name, discovered_at, last_seen_at, discovery_source, is_active)
        VALUES (?, ?, ?, ?, ?, 1)
      `).bind(body.endpoint_url, 'Unknown', now, now, 'manual').run();

      // Fetch the newly created endpoint
      endpoint = await env.DB.prepare(
        'SELECT * FROM endpoints WHERE url = ?'
      ).bind(body.endpoint_url).first() as Endpoint;
    }

    // Run live test
    const testResult = await testEndpoint(endpoint);

    // Calculate trust score if we have enough data
    const trustScore = await calculateTrustScoreForEndpoint(env, endpoint);

    const response: VerifyLiveResponse = {
      endpoint: body.endpoint_url,
      test_result: {
        success: testResult.is_successful,
        status_code: testResult.status_code,
        response_time_ms: testResult.response_time_ms,
        error: testResult.error_message,
      },
      trust_score: {
        overall: trustScore.overall_score,
        grade: trustScore.grade,
        recommendation: trustScore.recommendation,
      },
      tested_at: new Date().toISOString(),
    };

    return new Response(JSON.stringify(response), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('Error in /verify-live:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

/**
 * Handle /compare endpoint - Compare multiple endpoints
 */
async function handleCompare(request: Request, env: Env): Promise<Response> {
  try {
    // Check payment (FREE for internal, $0.50 for external)
    const isInternal = isInternalRequest(request, env);
    if (!isInternal) {
      const hasPayment = await hasValidPayment(request, 0.50);
      if (!hasPayment) {
        return new Response(JSON.stringify({
          error: 'Payment required: $0.50 USDC',
        }), { status: 402, headers: { 'Content-Type': 'application/json' } });
      }
    }

    const body: CompareEndpointsRequest = await request.json();

    if (!body.endpoint_urls || body.endpoint_urls.length < 2 || body.endpoint_urls.length > 5) {
      return new Response(JSON.stringify({ error: 'Provide 2-5 endpoint URLs' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Get endpoints and trust scores
    const comparison = [];
    for (const url of body.endpoint_urls) {
      const endpoint = await env.DB.prepare(
        'SELECT * FROM endpoints WHERE url = ?'
      ).bind(url).first() as Endpoint | null;

      if (!endpoint) {
        comparison.push({
          url,
          name: 'Not Found',
          trust_score: 0,
          grade: 'F',
          avg_response_time_ms: 0,
          uptime_percentage: 0,
          recommendation: 'AVOID',
        });
        continue;
      }

      const trustScore = await env.DB.prepare(
        'SELECT * FROM trust_scores WHERE endpoint_id = ?'
      ).bind(endpoint.id).first() as TrustScore | null;

      if (!trustScore) {
        comparison.push({
          url,
          name: endpoint.name,
          trust_score: 0,
          grade: 'F',
          avg_response_time_ms: 0,
          uptime_percentage: 0,
          recommendation: 'AVOID',
        });
        continue;
      }

      const uptimePercent = trustScore.total_tests > 0
        ? (trustScore.successful_tests / trustScore.total_tests) * 100
        : 0;

      comparison.push({
        url,
        name: endpoint.name,
        trust_score: trustScore.overall_score,
        grade: trustScore.grade,
        avg_response_time_ms: trustScore.avg_response_time_ms,
        uptime_percentage: Math.round(uptimePercent * 10) / 10,
        recommendation: trustScore.recommendation,
      });
    }

    // Find winner (highest trust score)
    const winner = comparison.reduce((best, current) =>
      current.trust_score > best.trust_score ? current : best
    );

    const response: CompareEndpointsResponse = {
      comparison,
      winner: {
        url: winner.url,
        reason: `Highest trust score (${winner.trust_score}) with ${winner.uptime_percentage}% uptime`,
      },
      tested_at: new Date().toISOString(),
    };

    return new Response(JSON.stringify(response), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('Error in /compare:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

/**
 * Main fetch handler
 */
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Internal-API-Key, X-Payment-Proof, X-Payment-Amount',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // Route requests
    if (url.pathname === '/discover' && request.method === 'POST') {
      const response = await handleDiscover(request, env);
      Object.entries(corsHeaders).forEach(([key, value]) =>
        response.headers.set(key, value)
      );
      return response;
    }

    if (url.pathname === '/trust-score' && request.method === 'POST') {
      const response = await handleTrustScore(request, env);
      Object.entries(corsHeaders).forEach(([key, value]) =>
        response.headers.set(key, value)
      );
      return response;
    }

    if (url.pathname === '/verify-live' && request.method === 'POST') {
      const response = await handleVerifyLive(request, env);
      Object.entries(corsHeaders).forEach(([key, value]) =>
        response.headers.set(key, value)
      );
      return response;
    }

    if (url.pathname === '/compare' && request.method === 'POST') {
      const response = await handleCompare(request, env);
      Object.entries(corsHeaders).forEach(([key, value]) =>
        response.headers.set(key, value)
      );
      return response;
    }

    // Default response
    return new Response(JSON.stringify({
      name: 'PulseRadar',
      version: '1.0.0',
      description: 'Endpoint discovery and trust scoring for x402 ecosystem',
      endpoints: [
        'POST /discover - List all discovered endpoints',
        'POST /trust-score - Get trust score for endpoint',
        'POST /verify-live - Run live verification test',
        'POST /compare - Compare multiple endpoints',
      ],
      pricing: {
        internal: 'FREE (with X-Internal-API-Key header)',
        external: '$0.50 USDC per query (x402 protocol)',
      },
    }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  },

  /**
   * Scheduled cron handler
   */
  async scheduled(event: ScheduledEvent, env: Env): Promise<void> {
    console.log(`Cron triggered: ${event.cron} at ${new Date(event.scheduledTime).toISOString()}`);

    try {
      // Run different jobs based on cron schedule
      if (event.cron === '0 */6 * * *') {
        // Discovery job - every 6 hours
        console.log('Running discovery job...');
        const result = await runDiscovery(env);
        console.log(`Discovery complete: ${result.total_discovered} discovered, ${result.new_endpoints} new`);
      } else if (event.cron === '*/30 * * * *') {
        // Testing job - every 30 minutes
        console.log('Running testing job...');
        const result = await testAllEndpoints(env, 50);
        console.log(`Testing complete: ${result.total_tested} tested, ${result.successful} successful`);
      } else if (event.cron === '0 * * * *') {
        // Trust score calculation - every hour
        console.log('Running trust score calculation...');
        const calculated = await calculateAllTrustScores(env);
        console.log(`Trust scores calculated for ${calculated} endpoints`);
      }
    } catch (error) {
      console.error('Error in scheduled job:', error);
    }
  },
};

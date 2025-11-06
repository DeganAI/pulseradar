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
  AgentHealthReportRequest,
  AgentHealthReportResponse,
  AgentEvaluationRequest,
  AgentEvaluationResponse,
  GetEvaluationsRequest,
  GetEvaluationsResponse,
  EvaluationPredictionRequest,
  EvaluationPredictionResponse,
  PredictionDiscrepancyRequest,
  PredictionDiscrepancyResponse,
  GetMarketplaceRequest,
  GetMarketplaceResponse,
  GetLeaderboardRequest,
  GetLeaderboardResponse,
  GetEvaluatorReputationRequest,
  GetEvaluatorReputationResponse,
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
 * Create x402 payment required response
 */
function createPaymentRequiredResponse(amount: string, facilitatorUrl: string): Response {
  const paymentResponse = {
    error: 'Payment Required',
    protocol: 'x402',
    amount: amount,
    currency: 'USDC',
    facilitator: facilitatorUrl,
    payTo: '0x01D11F7e1a46AbFC6092d7be484895D2d505095c',
    network: 'base',
    asset: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    instructions: `Payment of ${amount} USDC required via x402 protocol`,
  };

  return new Response(JSON.stringify(paymentResponse), {
    status: 402,
    headers: {
      'Content-Type': 'application/json',
      'X-Accept-Payment': 'USDC',
      'X-Payment-Amount': amount,
      'X-Payment-Facilitator': facilitatorUrl,
      'X-Payment-Address': '0x01D11F7e1a46AbFC6092d7be484895D2d505095c',
      'X-Payment-Network': 'base',
    },
  });
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
        const facilitatorUrl = env.FACILITATOR_URL || 'https://facilitator.daydreams.systems';
        return createPaymentRequiredResponse('0.50', facilitatorUrl);
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
        const facilitatorUrl = env.FACILITATOR_URL || 'https://facilitator.daydreams.systems';
        return createPaymentRequiredResponse('0.50', facilitatorUrl);
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
        const facilitatorUrl = env.FACILITATOR_URL || 'https://facilitator.daydreams.systems';
        return createPaymentRequiredResponse('0.50', facilitatorUrl);
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
        const facilitatorUrl = env.FACILITATOR_URL || 'https://facilitator.daydreams.systems';
        return createPaymentRequiredResponse('0.50', facilitatorUrl);
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
 * Handle /internal/agent-report endpoint - Receive health reports from agents
 */
async function handleAgentHealthReport(request: Request, env: Env): Promise<Response> {
  try {
    const body: AgentHealthReportRequest = await request.json();

    // Validate required fields
    if (!body.agent_url || !body.agent_name || !body.metrics || !body.health_status) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Missing required fields: agent_url, agent_name, metrics, health_status',
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Check if this agent is a known endpoint
    const endpoint = await env.DB.prepare(
      'SELECT id FROM endpoints WHERE url = ?'
    ).bind(body.agent_url).first() as Endpoint | null;

    // Insert health report into database
    const result = await env.DB.prepare(`
      INSERT INTO agent_health_reports (
        agent_url, agent_name, report_timestamp,
        total_queries, success_rate, error_rate,
        avg_response_time_ms, p95_response_time_ms, p99_response_time_ms,
        errors_by_type, adjustments, health_status, endpoint_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      body.agent_url,
      body.agent_name,
      body.timestamp || Math.floor(Date.now() / 1000),
      body.metrics.total_queries,
      body.metrics.success_rate,
      body.metrics.error_rate,
      body.metrics.avg_response_time,
      body.metrics.p95_response_time,
      body.metrics.p99_response_time,
      JSON.stringify(body.metrics.errors_by_type || {}),
      JSON.stringify(body.adjustments || []),
      body.health_status,
      endpoint?.id || null
    ).run();

    // Generate feedback based on health status and metrics
    const feedback: { recommendation?: string; suggested_optimizations?: string[] } = {};

    if (body.health_status === 'CRITICAL' || body.health_status === 'POOR') {
      feedback.recommendation = 'Agent performance is below acceptable levels. Review error logs and consider implementing suggested optimizations.';
      feedback.suggested_optimizations = [];

      if (body.metrics.error_rate > 0.2) {
        feedback.suggested_optimizations.push('High error rate detected. Implement retry logic with exponential backoff.');
      }
      if (body.metrics.avg_response_time > 10000) {
        feedback.suggested_optimizations.push('Response time exceeds 10s. Enable caching for frequently requested data.');
      }
      if (body.metrics.errors_by_type?.TIMEOUT > 5) {
        feedback.suggested_optimizations.push('Multiple timeout errors. Increase timeout threshold or optimize upstream dependencies.');
      }
      if (body.metrics.errors_by_type?.RATE_LIMIT > 3) {
        feedback.suggested_optimizations.push('Rate limiting detected. Implement request throttling and queuing.');
      }
    } else if (body.health_status === 'FAIR') {
      feedback.recommendation = 'Agent performance is acceptable but could be improved with optimizations.';
      feedback.suggested_optimizations = [];

      if (body.metrics.avg_response_time > 5000) {
        feedback.suggested_optimizations.push('Consider implementing caching to improve response times.');
      }
      if (body.metrics.success_rate < 0.95) {
        feedback.suggested_optimizations.push('Improve error handling and retry logic to increase success rate.');
      }
    } else if (body.health_status === 'GOOD' || body.health_status === 'EXCELLENT') {
      feedback.recommendation = 'Agent performance is excellent. Continue monitoring for anomalies.';
      feedback.suggested_optimizations = [
        'Maintain current optimization strategies.',
        'Consider documenting successful patterns for other agents.',
      ];
    }

    console.log(`Health report received from ${body.agent_name}: ${body.health_status}`);

    const response: AgentHealthReportResponse = {
      success: true,
      message: 'Health report received and stored',
      report_id: result.meta.last_row_id as number,
      feedback,
    };

    return new Response(JSON.stringify(response), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('Error in /internal/agent-report:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message,
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

/**
 * Handle /internal/agent-evaluation endpoint - Receive agent evaluation results (Phase 2)
 */
async function handleAgentEvaluation(request: Request, env: Env): Promise<Response> {
  try {
    const body: AgentEvaluationRequest = await request.json();

    // Validate required fields
    if (!body.evaluator_url || !body.target_url || !body.score || !body.grade) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Missing required fields: evaluator_url, target_url, score, grade',
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Check if target is a known endpoint
    const endpoint = await env.DB.prepare(
      'SELECT id FROM endpoints WHERE url = ?'
    ).bind(body.target_url).first() as Endpoint | null;

    // Insert evaluation into database
    const result = await env.DB.prepare(`
      INSERT INTO agent_evaluations (
        evaluator_url, evaluator_name, target_url, target_name,
        evaluation_timestamp, test_level, total_tests, total_time_ms,
        score, grade, recommendation, strengths, weaknesses,
        test_results, target_endpoint_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      body.evaluator_url,
      body.evaluator_name || null,
      body.target_url,
      body.target_name || null,
      body.timestamp || Math.floor(Date.now() / 1000),
      body.test_level,
      body.total_tests,
      body.total_time_ms,
      body.score,
      body.grade,
      body.recommendation,
      JSON.stringify(body.strengths || []),
      JSON.stringify(body.weaknesses || []),
      JSON.stringify(body.test_results || []),
      endpoint?.id || null
    ).run();

    // Generate feedback based on evaluation results
    const feedback: { message: string; trends?: string[] } = {
      message: '',
      trends: [],
    };

    if (body.score >= 85) {
      feedback.message = 'Excellent evaluation! Target agent shows strong performance across all metrics.';
    } else if (body.score >= 70) {
      feedback.message = 'Good evaluation. Target agent shows solid performance with room for improvement.';
      feedback.trends = ['Monitor identified weaknesses for improvement'];
    } else if (body.score >= 50) {
      feedback.message = 'Fair evaluation. Target agent has significant areas needing improvement.';
      feedback.trends = [
        'Review weaknesses identified in evaluation',
        'Consider re-evaluation after improvements',
      ];
    } else {
      feedback.message = 'Poor evaluation. Target agent requires substantial improvements before recommended use.';
      feedback.trends = [
        'Address critical weaknesses before deployment',
        'Review test results for specific failure points',
      ];
    }

    // Get historical evaluations for trending
    const previousEvals = await env.DB.prepare(`
      SELECT score, evaluation_timestamp
      FROM agent_evaluations
      WHERE target_url = ?
      ORDER BY evaluation_timestamp DESC
      LIMIT 5
    `).bind(body.target_url).all();

    if (previousEvals.results && previousEvals.results.length > 1) {
      const scores = previousEvals.results.map((e: any) => e.score);
      const avgPrevious = scores.slice(1).reduce((a: number, b: number) => a + b, 0) / (scores.length - 1);

      if (body.score > avgPrevious + 10) {
        feedback.trends?.push('Score trending upward - agent is improving');
      } else if (body.score < avgPrevious - 10) {
        feedback.trends?.push('Score trending downward - agent performance declining');
      }
    }

    console.log(`Evaluation received: ${body.evaluator_name || body.evaluator_url} evaluated ${body.target_name || body.target_url} - Grade: ${body.grade} (${body.score}/100)`);

    const response: AgentEvaluationResponse = {
      success: true,
      message: 'Evaluation received and stored',
      evaluation_id: result.meta.last_row_id as number,
      feedback,
    };

    return new Response(JSON.stringify(response), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('Error in /internal/agent-evaluation:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message,
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

/**
 * Handle /evaluations endpoint - Query agent evaluation history
 */
async function handleGetEvaluations(request: Request, env: Env): Promise<Response> {
  try {
    const body: GetEvaluationsRequest = await request.json();

    let query = 'SELECT id, evaluator_url, target_url, target_name, evaluation_timestamp, score, grade, recommendation, test_level FROM agent_evaluations WHERE 1=1';
    const params: any[] = [];

    if (body.target_url) {
      query += ' AND target_url = ?';
      params.push(body.target_url);
    }

    if (body.evaluator_url) {
      query += ' AND evaluator_url = ?';
      params.push(body.evaluator_url);
    }

    if (body.min_score) {
      query += ' AND score >= ?';
      params.push(body.min_score);
    }

    query += ' ORDER BY evaluation_timestamp DESC LIMIT ?';
    params.push(body.limit || 20);

    const result = await env.DB.prepare(query).bind(...params).all();

    const evaluations = result.results.map((row: any) => ({
      id: row.id,
      evaluator_url: row.evaluator_url,
      target_url: row.target_url,
      target_name: row.target_name,
      evaluation_timestamp: row.evaluation_timestamp,
      score: row.score,
      grade: row.grade,
      recommendation: row.recommendation,
      test_level: row.test_level,
    }));

    // Calculate summary if filtering by target_url
    let summary;
    if (body.target_url && evaluations.length > 0) {
      const avgScore = evaluations.reduce((sum, e) => sum + e.score, 0) / evaluations.length;
      summary = {
        avg_score: Math.round(avgScore),
        total_evaluations: evaluations.length,
        latest_grade: evaluations[0].grade,
      };
    }

    const response: GetEvaluationsResponse = {
      evaluations,
      summary,
    };

    return new Response(JSON.stringify(response), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('Error in /evaluations:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

/**
 * Handle /internal/agent-prediction endpoint - Receive prediction before evaluation (Phase 3)
 */
async function handleAgentPrediction(request: Request, env: Env): Promise<Response> {
  try {
    const body: EvaluationPredictionRequest = await request.json();

    // Validate required fields
    if (!body.evaluator_url || !body.target_url || !body.predicted_score || !body.predicted_grade) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Missing required fields: evaluator_url, target_url, predicted_score, predicted_grade',
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Insert prediction into database
    const result = await env.DB.prepare(`
      INSERT INTO evaluation_predictions (
        evaluator_url, evaluator_name, target_url, target_name,
        prediction_timestamp, predicted_score, predicted_grade,
        confidence_level, prediction_basis, historical_data_points,
        similar_agents_analyzed, features_analyzed, actual_evaluation_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      body.evaluator_url,
      body.evaluator_name || null,
      body.target_url,
      body.target_name || null,
      body.prediction_timestamp,
      body.predicted_score,
      body.predicted_grade,
      body.confidence_level,
      body.prediction_basis,
      body.historical_data_points || 0,
      body.similar_agents_analyzed || 0,
      JSON.stringify(body.features_analyzed || []),
      body.actual_evaluation_id || null
    ).run();

    console.log(`Prediction received from ${body.evaluator_name || body.evaluator_url}: ${body.predicted_score} (Grade ${body.predicted_grade}) for ${body.target_url}`);

    const response: EvaluationPredictionResponse = {
      success: true,
      message: 'Prediction received and stored',
      prediction_id: result.meta.last_row_id as number,
    };

    return new Response(JSON.stringify(response), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('Error in /internal/agent-prediction:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message,
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

/**
 * Handle /internal/agent-discrepancy endpoint - Receive discrepancy analysis (Phase 3)
 */
async function handleAgentDiscrepancy(request: Request, env: Env): Promise<Response> {
  try {
    const body: PredictionDiscrepancyRequest = await request.json();

    // Validate required fields
    if (!body.evaluator_url || !body.target_url || body.predicted_score === undefined || body.actual_score === undefined) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Missing required fields: evaluator_url, target_url, predicted_score, actual_score',
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Insert discrepancy into database
    const result = await env.DB.prepare(`
      INSERT INTO prediction_discrepancies (
        evaluator_url, target_url, analysis_timestamp,
        predicted_score, actual_score, score_difference, absolute_error,
        predicted_grade, actual_grade, grade_match,
        confidence_was, prediction_basis_was, test_discrepancies,
        accuracy_category, overestimated
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      body.evaluator_url,
      body.target_url,
      body.analysis_timestamp,
      body.predicted_score,
      body.actual_score,
      body.score_difference,
      body.absolute_error,
      body.predicted_grade,
      body.actual_grade,
      body.grade_match ? 1 : 0,
      body.confidence_was,
      body.prediction_basis_was,
      body.test_discrepancies || '[]',
      body.accuracy_category,
      body.overestimated ? 1 : 0
    ).run();

    // Update evaluator's prediction accuracy (Phase 4 integration)
    // Get evaluator if exists
    const evaluator = await env.DB.prepare(
      'SELECT id, total_predictions, avg_absolute_error, grade_accuracy_rate FROM evaluators WHERE evaluator_url = ?'
    ).bind(body.evaluator_url).first() as any;

    if (evaluator) {
      // Recalculate running averages
      const newTotalPredictions = evaluator.total_predictions + 1;
      const newAvgError = (evaluator.avg_absolute_error * evaluator.total_predictions + body.absolute_error) / newTotalPredictions;
      const gradeMatch = body.grade_match ? 1 : 0;
      const newGradeAccuracy = (evaluator.grade_accuracy_rate * evaluator.total_predictions + gradeMatch) / newTotalPredictions;

      await env.DB.prepare(`
        UPDATE evaluators
        SET total_predictions = ?,
            avg_absolute_error = ?,
            grade_accuracy_rate = ?,
            prediction_accuracy_rate = ?
        WHERE id = ?
      `).bind(
        newTotalPredictions,
        newAvgError,
        newGradeAccuracy,
        1.0 - (newAvgError / 100), // Convert error to accuracy rate
        evaluator.id
      ).run();
    }

    // Generate learning insights
    const learningInsights: { evaluator_performance: string; suggested_adjustments?: string[] } = {
      evaluator_performance: '',
      suggested_adjustments: [],
    };

    if (body.accuracy_category === 'excellent') {
      learningInsights.evaluator_performance = 'Excellent prediction accuracy! Your model is well-calibrated.';
    } else if (body.accuracy_category === 'good') {
      learningInsights.evaluator_performance = 'Good prediction accuracy. Minor adjustments may improve performance.';
      learningInsights.suggested_adjustments = ['Consider adjusting test weights based on discrepancy patterns'];
    } else if (body.accuracy_category === 'fair') {
      learningInsights.evaluator_performance = 'Fair prediction accuracy. Review prediction model for improvements.';
      learningInsights.suggested_adjustments = [
        'Analyze which test categories show highest discrepancy',
        'Increase weight on consistently underestimated categories',
        'Gather more historical data for better predictions',
      ];
    } else {
      learningInsights.evaluator_performance = 'Poor prediction accuracy. Significant model adjustments needed.';
      learningInsights.suggested_adjustments = [
        'Review prediction basis - consider using more historical data',
        'Recalibrate confidence thresholds',
        'Analyze test discrepancies for systematic bias',
        'Consider adjusting baseline assumptions',
      ];
    }

    console.log(`Discrepancy analysis from ${body.evaluator_url}: Error=${body.absolute_error}, Category=${body.accuracy_category}`);

    const response: PredictionDiscrepancyResponse = {
      success: true,
      message: 'Discrepancy analysis received and stored',
      discrepancy_id: result.meta.last_row_id as number,
      learning_insights: learningInsights,
    };

    return new Response(JSON.stringify(response), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('Error in /internal/agent-discrepancy:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message,
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

/**
 * Handle /marketplace endpoint - Browse marketplace listings (Phase 4)
 */
async function handleGetMarketplace(request: Request, env: Env): Promise<Response> {
  try {
    const url = new URL(request.url);
    const testLevel = url.searchParams.get('test_level') as 'quick' | 'comprehensive' | 'custom' | null;
    const minTrustScore = url.searchParams.get('min_trust_score') ? parseInt(url.searchParams.get('min_trust_score')!) : undefined;
    const maxPrice = url.searchParams.get('max_price') ? parseFloat(url.searchParams.get('max_price')!) : undefined;
    const requiresStake = url.searchParams.get('requires_stake') === 'true' ? true : undefined;
    const limit = parseInt(url.searchParams.get('limit') || '20');

    let query = `
      SELECT
        l.id, l.evaluator_id, l.service_name, l.service_description,
        l.test_level, l.price_x402, l.estimated_time_minutes,
        l.requires_stake, l.stake_amount_x402, l.accuracy_guarantee,
        l.response_time_guarantee_minutes, l.is_active, l.slots_available,
        e.evaluator_name, e.trust_score, e.prediction_accuracy_rate,
        e.total_evaluations
      FROM marketplace_listings l
      JOIN evaluators e ON l.evaluator_id = e.id
      WHERE l.is_active = 1
    `;
    const params: any[] = [];

    if (testLevel) {
      query += ' AND l.test_level = ?';
      params.push(testLevel);
    }
    if (minTrustScore) {
      query += ' AND e.trust_score >= ?';
      params.push(minTrustScore);
    }
    if (maxPrice) {
      query += ' AND l.price_x402 <= ?';
      params.push(maxPrice);
    }
    if (requiresStake !== undefined) {
      query += ' AND l.requires_stake = ?';
      params.push(requiresStake ? 1 : 0);
    }

    query += ' ORDER BY e.trust_score DESC, l.price_x402 ASC LIMIT ?';
    params.push(limit);

    const result = await env.DB.prepare(query).bind(...params).all();

    const listings = result.results.map((row: any) => ({
      id: row.id,
      evaluator_id: row.evaluator_id,
      evaluator_name: row.evaluator_name,
      trust_score: row.trust_score,
      service_name: row.service_name,
      service_description: row.service_description,
      test_level: row.test_level,
      price_x402: row.price_x402,
      estimated_time_minutes: row.estimated_time_minutes,
      requires_stake: row.requires_stake === 1,
      stake_amount_x402: row.stake_amount_x402,
      accuracy_guarantee: row.accuracy_guarantee,
      response_time_guarantee_minutes: row.response_time_guarantee_minutes,
      is_active: row.is_active === 1,
      slots_available: row.slots_available,
    }));

    const response: GetMarketplaceResponse = {
      listings,
      total_count: listings.length,
    };

    return new Response(JSON.stringify(response), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('Error in /marketplace:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

/**
 * Handle /leaderboard endpoint - Get top evaluators (Phase 4)
 */
async function handleGetLeaderboard(request: Request, env: Env): Promise<Response> {
  try {
    const url = new URL(request.url);
    const limit = parseInt(url.searchParams.get('limit') || '10');
    const minEvaluations = parseInt(url.searchParams.get('min_evaluations') || '5');

    const result = await env.DB.prepare(`
      SELECT
        id, evaluator_url, evaluator_name, trust_score,
        prediction_accuracy_rate, calibration_score, consistency_score,
        total_evaluations, total_predictions, avg_absolute_error,
        grade_accuracy_rate, is_marketplace_listed, available
      FROM evaluators
      WHERE total_evaluations >= ? AND is_marketplace_listed = 1 AND available = 1
      ORDER BY trust_score DESC
      LIMIT ?
    `).bind(minEvaluations, limit).all();

    const evaluators = result.results.map((row: any, index) => ({
      id: row.id,
      evaluator_url: row.evaluator_url,
      evaluator_name: row.evaluator_name,
      trust_score: row.trust_score,
      prediction_accuracy_rate: row.prediction_accuracy_rate,
      calibration_score: row.calibration_score,
      consistency_score: row.consistency_score,
      total_evaluations: row.total_evaluations,
      total_predictions: row.total_predictions,
      avg_absolute_error: row.avg_absolute_error,
      grade_accuracy_rate: row.grade_accuracy_rate,
      is_marketplace_listed: row.is_marketplace_listed === 1,
      available: row.available === 1,
      rank: index + 1,
    }));

    const response: GetLeaderboardResponse = {
      evaluators,
    };

    return new Response(JSON.stringify(response), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('Error in /leaderboard:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

/**
 * Handle /evaluator/:url endpoint - Get evaluator reputation (Phase 4)
 */
async function handleGetEvaluatorReputation(evaluatorUrl: string, env: Env): Promise<Response> {
  try {
    // Get evaluator profile
    const evaluator = await env.DB.prepare(`
      SELECT * FROM evaluators WHERE evaluator_url = ?
    `).bind(evaluatorUrl).first() as any;

    if (!evaluator) {
      return new Response(JSON.stringify({ error: 'Evaluator not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Get recent evaluations
    const recentEvals = await env.DB.prepare(`
      SELECT target_url, score, grade, evaluation_timestamp
      FROM agent_evaluations
      WHERE evaluator_url = ?
      ORDER BY evaluation_timestamp DESC
      LIMIT 10
    `).bind(evaluatorUrl).all();

    // Get prediction stats
    const predictionStats = await env.DB.prepare(`
      SELECT
        COUNT(*) as total_predictions,
        AVG(absolute_error) as avg_error,
        AVG(CASE WHEN grade_match = 1 THEN 1.0 ELSE 0.0 END) as grade_accuracy,
        AVG(confidence_was) as confidence_calibration
      FROM prediction_discrepancies
      WHERE evaluator_url = ?
    `).bind(evaluatorUrl).first() as any;

    // Get trust score history
    const trustHistory = await env.DB.prepare(`
      SELECT snapshot_timestamp, trust_score, change_reason
      FROM evaluator_reputation_history
      WHERE evaluator_id = ?
      ORDER BY snapshot_timestamp DESC
      LIMIT 20
    `).bind(evaluator.id).all();

    const response: GetEvaluatorReputationResponse = {
      evaluator: {
        id: evaluator.id,
        evaluator_url: evaluator.evaluator_url,
        evaluator_name: evaluator.evaluator_name,
        description: evaluator.description,
        trust_score: evaluator.trust_score,
        prediction_accuracy_rate: evaluator.prediction_accuracy_rate,
        calibration_score: evaluator.calibration_score,
        consistency_score: evaluator.consistency_score,
        total_evaluations: evaluator.total_evaluations,
        total_predictions: evaluator.total_predictions,
        avg_absolute_error: evaluator.avg_absolute_error,
        grade_accuracy_rate: evaluator.grade_accuracy_rate,
        is_marketplace_listed: evaluator.is_marketplace_listed === 1,
        available: evaluator.available === 1,
      },
      recent_evaluations: recentEvals.results.map((row: any) => ({
        target_url: row.target_url,
        score: row.score,
        grade: row.grade,
        timestamp: row.evaluation_timestamp,
      })),
      prediction_stats: {
        total_predictions: predictionStats?.total_predictions || 0,
        avg_error: predictionStats?.avg_error || 0,
        grade_accuracy: predictionStats?.grade_accuracy || 0,
        confidence_calibration: predictionStats?.confidence_calibration || 0,
      },
      trust_score_history: trustHistory.results.map((row: any) => ({
        timestamp: row.snapshot_timestamp,
        trust_score: row.trust_score,
        change_reason: row.change_reason,
      })),
    };

    return new Response(JSON.stringify(response), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('Error in /evaluator/:url:', error);
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

    // Internal admin endpoints (require API key)
    if (url.pathname === '/internal/trigger-discovery' && request.method === 'POST') {
      if (!isInternalRequest(request, env)) {
        return new Response('Unauthorized', { status: 401 });
      }

      try {
        console.log('Manual discovery trigger requested');
        const result = await runDiscovery(env);
        return new Response(JSON.stringify({
          success: true,
          message: 'Discovery completed',
          total_discovered: result.total_discovered,
          new_endpoints: result.new_endpoints,
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
      } catch (error: any) {
        console.error('Manual discovery failed:', error);
        return new Response(JSON.stringify({
          success: false,
          error: error.message,
        }), {
          status: 500,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
      }
    }

    if (url.pathname === '/internal/trigger-testing' && request.method === 'POST') {
      if (!isInternalRequest(request, env)) {
        return new Response('Unauthorized', { status: 401 });
      }

      try {
        console.log('Manual testing trigger requested');
        const result = await testAllEndpoints(env, 50);
        return new Response(JSON.stringify({
          success: true,
          message: 'Testing completed',
          total_tested: result.total_tested,
          successful: result.successful,
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
      } catch (error: any) {
        console.error('Manual testing failed:', error);
        return new Response(JSON.stringify({
          success: false,
          error: error.message,
        }), {
          status: 500,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
      }
    }

    if (url.pathname === '/internal/trigger-trust-score' && request.method === 'POST') {
      if (!isInternalRequest(request, env)) {
        return new Response('Unauthorized', { status: 401 });
      }

      try {
        console.log('Manual trust score calculation requested');
        const calculated = await calculateAllTrustScores(env);
        return new Response(JSON.stringify({
          success: true,
          message: 'Trust scores calculated',
          endpoints_calculated: calculated,
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
      } catch (error: any) {
        console.error('Manual trust score calculation failed:', error);
        return new Response(JSON.stringify({
          success: false,
          error: error.message,
        }), {
          status: 500,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
      }
    }

    if (url.pathname === '/internal/agent-report' && request.method === 'POST') {
      if (!isInternalRequest(request, env)) {
        return new Response('Unauthorized', { status: 401 });
      }

      const response = await handleAgentHealthReport(request, env);
      Object.entries(corsHeaders).forEach(([key, value]) =>
        response.headers.set(key, value)
      );
      return response;
    }

    if (url.pathname === '/internal/agent-evaluation' && request.method === 'POST') {
      if (!isInternalRequest(request, env)) {
        return new Response('Unauthorized', { status: 401 });
      }

      const response = await handleAgentEvaluation(request, env);
      Object.entries(corsHeaders).forEach(([key, value]) =>
        response.headers.set(key, value)
      );
      return response;
    }

    if (url.pathname === '/evaluations' && request.method === 'POST') {
      // Check payment (FREE for internal, $0.25 for external)
      const isInternal = isInternalRequest(request, env);
      if (!isInternal) {
        const hasPayment = await hasValidPayment(request, 0.25);
        if (!hasPayment) {
          const facilitatorUrl = env.FACILITATOR_URL || 'https://facilitator.daydreams.systems';
          return createPaymentRequiredResponse('0.25', facilitatorUrl);
        }
      }

      const response = await handleGetEvaluations(request, env);
      Object.entries(corsHeaders).forEach(([key, value]) =>
        response.headers.set(key, value)
      );
      return response;
    }

    // Phase 3: Prediction endpoints
    if (url.pathname === '/internal/agent-prediction' && request.method === 'POST') {
      if (!isInternalRequest(request, env)) {
        return new Response('Unauthorized', { status: 401 });
      }

      const response = await handleAgentPrediction(request, env);
      Object.entries(corsHeaders).forEach(([key, value]) =>
        response.headers.set(key, value)
      );
      return response;
    }

    if (url.pathname === '/internal/agent-discrepancy' && request.method === 'POST') {
      if (!isInternalRequest(request, env)) {
        return new Response('Unauthorized', { status: 401 });
      }

      const response = await handleAgentDiscrepancy(request, env);
      Object.entries(corsHeaders).forEach(([key, value]) =>
        response.headers.set(key, value)
      );
      return response;
    }

    // Phase 4: Marketplace endpoints
    if (url.pathname === '/marketplace' && request.method === 'GET') {
      // Check payment (FREE for internal, $0.25 for external)
      const isInternal = isInternalRequest(request, env);
      if (!isInternal) {
        const hasPayment = await hasValidPayment(request, 0.25);
        if (!hasPayment) {
          const facilitatorUrl = env.FACILITATOR_URL || 'https://facilitator.daydreams.systems';
          return createPaymentRequiredResponse('0.25', facilitatorUrl);
        }
      }

      const response = await handleGetMarketplace(request, env);
      Object.entries(corsHeaders).forEach(([key, value]) =>
        response.headers.set(key, value)
      );
      return response;
    }

    if (url.pathname === '/leaderboard' && request.method === 'GET') {
      // Check payment (FREE for internal, $0.25 for external)
      const isInternal = isInternalRequest(request, env);
      if (!isInternal) {
        const hasPayment = await hasValidPayment(request, 0.25);
        if (!hasPayment) {
          const facilitatorUrl = env.FACILITATOR_URL || 'https://facilitator.daydreams.systems';
          return createPaymentRequiredResponse('0.25', facilitatorUrl);
        }
      }

      const response = await handleGetLeaderboard(request, env);
      Object.entries(corsHeaders).forEach(([key, value]) =>
        response.headers.set(key, value)
      );
      return response;
    }

    if (url.pathname.startsWith('/evaluator/') && request.method === 'GET') {
      // Extract evaluator URL from path
      const evaluatorUrl = decodeURIComponent(url.pathname.substring('/evaluator/'.length));

      // Check payment (FREE for internal, $0.25 for external)
      const isInternal = isInternalRequest(request, env);
      if (!isInternal) {
        const hasPayment = await hasValidPayment(request, 0.25);
        if (!hasPayment) {
          const facilitatorUrl = env.FACILITATOR_URL || 'https://facilitator.daydreams.systems';
          return createPaymentRequiredResponse('0.25', facilitatorUrl);
        }
      }

      const response = await handleGetEvaluatorReputation(evaluatorUrl, env);
      Object.entries(corsHeaders).forEach(([key, value]) =>
        response.headers.set(key, value)
      );
      return response;
    }

    // Default response
    return new Response(JSON.stringify({
      name: 'PulseRadar',
      version: '2.0.0',
      description: 'Endpoint discovery, trust scoring, agent evaluation, and marketplace for x402 ecosystem',
      endpoints: {
        public: [
          'POST /discover - List all discovered endpoints',
          'POST /trust-score - Get trust score for endpoint',
          'POST /verify-live - Run live verification test',
          'POST /compare - Compare multiple endpoints',
          'POST /evaluations - Query agent evaluation history',
          'GET /marketplace - Browse evaluator marketplace listings',
          'GET /leaderboard - Get top-rated evaluators',
          'GET /evaluator/:url - Get evaluator reputation and stats',
        ],
        internal: [
          'POST /internal/agent-report - Submit agent health report (Phase 1)',
          'POST /internal/agent-evaluation - Submit agent evaluation (Phase 2)',
          'POST /internal/agent-prediction - Submit evaluation prediction (Phase 3)',
          'POST /internal/agent-discrepancy - Submit prediction discrepancy analysis (Phase 3)',
          'POST /internal/trigger-discovery - Manually trigger endpoint discovery',
          'POST /internal/trigger-testing - Manually trigger endpoint testing',
          'POST /internal/trigger-trust-score - Manually trigger trust score calculation',
        ],
      },
      phases: {
        phase1: 'Self-Improvement - Agents report health metrics and self-adjustments',
        phase2: 'Cross-Agent Evaluation - Agents evaluate each other for quality',
        phase3: 'Predictive Evaluation - Agents predict scores and learn from discrepancies',
        phase4: 'Marketplace & Reputation - Evaluators build reputation and offer services',
      },
      pricing: {
        internal: 'FREE (with X-Internal-API-Key header)',
        public_queries: '$0.50 USDC per query (x402 protocol)',
        evaluations: '$0.25 USDC per query (x402 protocol)',
        marketplace: '$0.25 USDC per query (x402 protocol)',
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

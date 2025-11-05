/**
 * Trust Score Calculator - Calculates TrustScore for endpoints
 *
 * Formula:
 * - Uptime Score (35%): Based on successful tests over time
 * - Speed Score (25%): Based on average response time
 * - Accuracy Score (30%): Based on consistency and valid responses
 * - Age Score (10%): How long the endpoint has been tracked
 */

import type { Env, Endpoint, EndpointTest, TrustScore } from '../types';
import { getEndpointTests, calculateUptime, calculateAvgResponseTime } from './testing';

/**
 * Calculate uptime score (0-100)
 * 99%+ uptime = 95-100 points
 * 95-99% = 85-95 points
 * 90-95% = 70-85 points
 * 80-90% = 50-70 points
 * <80% = 0-50 points
 */
export function calculateUptimeScore(uptimePercent: number): number {
  if (uptimePercent >= 99) return 95 + (uptimePercent - 99) * 5; // 95-100
  if (uptimePercent >= 95) return 85 + ((uptimePercent - 95) / 4) * 10; // 85-95
  if (uptimePercent >= 90) return 70 + ((uptimePercent - 90) / 5) * 15; // 70-85
  if (uptimePercent >= 80) return 50 + ((uptimePercent - 80) / 10) * 20; // 50-70
  return (uptimePercent / 80) * 50; // 0-50
}

/**
 * Calculate speed score (0-100)
 * <200ms = 95-100 points
 * 200-500ms = 85-95 points
 * 500-1000ms = 70-85 points
 * 1000-2000ms = 50-70 points
 * >2000ms = 0-50 points
 */
export function calculateSpeedScore(avgResponseTimeMs: number): number {
  if (avgResponseTimeMs < 200) return 95 + ((200 - avgResponseTimeMs) / 200) * 5; // 95-100
  if (avgResponseTimeMs < 500) return 85 + ((500 - avgResponseTimeMs) / 300) * 10; // 85-95
  if (avgResponseTimeMs < 1000) return 70 + ((1000 - avgResponseTimeMs) / 500) * 15; // 70-85
  if (avgResponseTimeMs < 2000) return 50 + ((2000 - avgResponseTimeMs) / 1000) * 20; // 50-70
  return Math.max(0, 50 - ((avgResponseTimeMs - 2000) / 2000) * 50); // 0-50
}

/**
 * Calculate accuracy score (0-100)
 * Based on: consistent responses, valid JSON, no errors
 * For now, simplified to uptime-like metric
 */
export function calculateAccuracyScore(tests: EndpointTest[]): number {
  if (tests.length === 0) return 0;

  // Check for valid responses (successful + has response_sample)
  const validResponses = tests.filter(
    t => t.is_successful && t.response_sample
  ).length;

  const accuracyPercent = (validResponses / tests.length) * 100;

  // Similar scoring to uptime
  if (accuracyPercent >= 95) return 90 + ((accuracyPercent - 95) / 5) * 10; // 90-100
  if (accuracyPercent >= 85) return 75 + ((accuracyPercent - 85) / 10) * 15; // 75-90
  if (accuracyPercent >= 70) return 55 + ((accuracyPercent - 70) / 15) * 20; // 55-75
  return (accuracyPercent / 70) * 55; // 0-55
}

/**
 * Calculate age score (0-100)
 * Longer tracked = more trustworthy
 * 30+ days = 95-100 points
 * 14-30 days = 80-95 points
 * 7-14 days = 60-80 points
 * 3-7 days = 40-60 points
 * <3 days = 0-40 points
 */
export function calculateAgeScore(firstTestedTimestamp: number): number {
  const now = Math.floor(Date.now() / 1000);
  const ageInSeconds = now - firstTestedTimestamp;
  const ageInDays = ageInSeconds / (24 * 60 * 60);

  if (ageInDays >= 30) return 95 + Math.min(5, (ageInDays - 30) / 30); // 95-100
  if (ageInDays >= 14) return 80 + ((ageInDays - 14) / 16) * 15; // 80-95
  if (ageInDays >= 7) return 60 + ((ageInDays - 7) / 7) * 20; // 60-80
  if (ageInDays >= 3) return 40 + ((ageInDays - 3) / 4) * 20; // 40-60
  return (ageInDays / 3) * 40; // 0-40
}

/**
 * Calculate overall TrustScore using weighted formula
 */
export function calculateOverallScore(
  uptimeScore: number,
  speedScore: number,
  accuracyScore: number,
  ageScore: number
): number {
  const score =
    uptimeScore * 0.35 +
    speedScore * 0.25 +
    accuracyScore * 0.30 +
    ageScore * 0.10;

  return Math.round(score * 10) / 10; // Round to 1 decimal
}

/**
 * Assign letter grade based on overall score
 */
export function calculateGrade(score: number): string {
  if (score >= 98) return 'A+';
  if (score >= 93) return 'A';
  if (score >= 90) return 'A-';
  if (score >= 87) return 'B+';
  if (score >= 83) return 'B';
  if (score >= 80) return 'B-';
  if (score >= 77) return 'C+';
  if (score >= 73) return 'C';
  if (score >= 70) return 'C-';
  if (score >= 60) return 'D';
  return 'F';
}

/**
 * Provide usage recommendation
 */
export function calculateRecommendation(score: number): 'TRUSTED' | 'CAUTION' | 'AVOID' {
  if (score >= 85) return 'TRUSTED';
  if (score >= 65) return 'CAUTION';
  return 'AVOID';
}

/**
 * Calculate trust score for a single endpoint
 */
export async function calculateTrustScoreForEndpoint(
  env: Env,
  endpoint: Endpoint
): Promise<TrustScore> {
  // Get test history
  const tests = await getEndpointTests(env, endpoint.id, 100);

  // If no tests, return default low score
  if (tests.length === 0) {
    return {
      endpoint_id: endpoint.id,
      uptime_score: 0,
      speed_score: 0,
      accuracy_score: 0,
      age_score: 0,
      overall_score: 0,
      grade: 'F',
      recommendation: 'AVOID',
      total_tests: 0,
      successful_tests: 0,
      failed_tests: 0,
      avg_response_time_ms: 0,
      first_tested_at: undefined,
      last_calculated_at: Math.floor(Date.now() / 1000),
    };
  }

  // Calculate component scores
  const uptimePercent = calculateUptime(tests);
  const avgResponseTime = calculateAvgResponseTime(tests);
  const firstTest = tests[tests.length - 1]; // oldest test

  const uptimeScore = calculateUptimeScore(uptimePercent);
  const speedScore = calculateSpeedScore(avgResponseTime);
  const accuracyScore = calculateAccuracyScore(tests);
  const ageScore = calculateAgeScore(firstTest.test_timestamp);

  const overallScore = calculateOverallScore(
    uptimeScore,
    speedScore,
    accuracyScore,
    ageScore
  );

  const grade = calculateGrade(overallScore);
  const recommendation = calculateRecommendation(overallScore);

  const successfulTests = tests.filter(t => t.is_successful).length;

  return {
    endpoint_id: endpoint.id,
    uptime_score: Math.round(uptimeScore * 10) / 10,
    speed_score: Math.round(speedScore * 10) / 10,
    accuracy_score: Math.round(accuracyScore * 10) / 10,
    age_score: Math.round(ageScore * 10) / 10,
    overall_score: overallScore,
    grade,
    recommendation,
    total_tests: tests.length,
    successful_tests: successfulTests,
    failed_tests: tests.length - successfulTests,
    avg_response_time_ms: Math.round(avgResponseTime),
    first_tested_at: firstTest.test_timestamp,
    last_calculated_at: Math.floor(Date.now() / 1000),
  };
}

/**
 * Save or update trust score in database
 */
export async function saveTrustScore(env: Env, trustScore: TrustScore): Promise<void> {
  try {
    // Check if trust score exists
    const existing = await env.DB.prepare(
      'SELECT id FROM trust_scores WHERE endpoint_id = ?'
    ).bind(trustScore.endpoint_id).first();

    if (existing) {
      // Update existing
      await env.DB.prepare(`
        UPDATE trust_scores SET
          uptime_score = ?,
          speed_score = ?,
          accuracy_score = ?,
          age_score = ?,
          overall_score = ?,
          grade = ?,
          recommendation = ?,
          total_tests = ?,
          successful_tests = ?,
          failed_tests = ?,
          avg_response_time_ms = ?,
          first_tested_at = ?,
          last_calculated_at = ?
        WHERE endpoint_id = ?
      `).bind(
        trustScore.uptime_score,
        trustScore.speed_score,
        trustScore.accuracy_score,
        trustScore.age_score,
        trustScore.overall_score,
        trustScore.grade,
        trustScore.recommendation,
        trustScore.total_tests,
        trustScore.successful_tests,
        trustScore.failed_tests,
        trustScore.avg_response_time_ms,
        trustScore.first_tested_at || null,
        trustScore.last_calculated_at,
        trustScore.endpoint_id
      ).run();
    } else {
      // Insert new
      await env.DB.prepare(`
        INSERT INTO trust_scores (
          endpoint_id, uptime_score, speed_score, accuracy_score, age_score,
          overall_score, grade, recommendation, total_tests, successful_tests,
          failed_tests, avg_response_time_ms, first_tested_at, last_calculated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        trustScore.endpoint_id,
        trustScore.uptime_score,
        trustScore.speed_score,
        trustScore.accuracy_score,
        trustScore.age_score,
        trustScore.overall_score,
        trustScore.grade,
        trustScore.recommendation,
        trustScore.total_tests,
        trustScore.successful_tests,
        trustScore.failed_tests,
        trustScore.avg_response_time_ms,
        trustScore.first_tested_at || null,
        trustScore.last_calculated_at
      ).run();
    }
  } catch (error) {
    console.error(`Error saving trust score for endpoint ${trustScore.endpoint_id}:`, error);
  }
}

/**
 * Calculate and save trust scores for all endpoints with tests
 */
export async function calculateAllTrustScores(env: Env): Promise<number> {
  console.log('Calculating trust scores for all endpoints...');

  // Get all endpoints that have been tested
  const { results: endpoints } = await env.DB.prepare(`
    SELECT DISTINCT e.* FROM endpoints e
    INNER JOIN endpoint_tests t ON e.id = t.endpoint_id
    WHERE e.is_active = 1
  `).all() as { results: Endpoint[] };

  console.log(`Calculating trust scores for ${endpoints.length} endpoints`);

  let calculated = 0;

  for (const endpoint of endpoints) {
    const trustScore = await calculateTrustScoreForEndpoint(env, endpoint);
    await saveTrustScore(env, trustScore);
    calculated++;
  }

  console.log(`Calculated ${calculated} trust scores`);

  return calculated;
}

/**
 * Discovery Engine - Finds x402 endpoints from various sources
 */

import type { Env, DiscoveryResult, AgentManifest } from '../types';

/**
 * Discover endpoints from x402scan.org
 */
export async function discoverFromX402Scan(): Promise<DiscoveryResult[]> {
  try {
    // x402scan API endpoint (if available) or scrape the website
    // For now, we'll fetch the public registry

    const response = await fetch('https://www.x402scan.com/api/agents', {
      headers: {
        'User-Agent': 'PulseRadar/1.0',
      },
    });

    if (!response.ok) {
      console.error(`x402scan fetch failed: ${response.status}`);
      return [];
    }

    const data = await response.json();

    // Parse response and extract endpoints
    // Format depends on x402scan's API structure
    const results: DiscoveryResult[] = [];

    if (Array.isArray(data)) {
      for (const agent of data) {
        // Try to fetch agent manifest
        const agentUrl = agent.url || agent.agent_address || agent.endpoint;
        if (agentUrl) {
          const manifest = await fetchAgentManifest(agentUrl);
          if (manifest) {
            results.push({
              url: agentUrl,
              name: manifest.name || agent.name || 'Unknown',
              description: manifest.description || agent.description,
              author: manifest.author || agent.author,
              organization: manifest.organization || agent.organization,
              source: 'x402scan',
            });
          }
        }
      }
    }

    return results;
  } catch (error) {
    console.error('Error discovering from x402scan:', error);
    return [];
  }
}

/**
 * Discover endpoints from GitHub (search for x402 projects)
 */
export async function discoverFromGitHub(): Promise<DiscoveryResult[]> {
  try {
    // Search GitHub for repos with x402 topics/keywords
    const query = 'x402 OR agent-kit OR "x402 protocol"';
    const response = await fetch(
      `https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&per_page=50`,
      {
        headers: {
          'User-Agent': 'PulseRadar/1.0',
          'Accept': 'application/vnd.github.v3+json',
        },
      }
    );

    if (!response.ok) {
      console.error(`GitHub search failed: ${response.status}`);
      return [];
    }

    const data = await response.json() as any;
    const results: DiscoveryResult[] = [];

    if (data.items && Array.isArray(data.items)) {
      for (const repo of data.items) {
        // Check if repo has a deployment URL in README or description
        // This is a heuristic - actual deployments would need to be verified
        if (repo.homepage && repo.homepage.includes('http')) {
          const manifest = await fetchAgentManifest(repo.homepage);
          if (manifest) {
            results.push({
              url: repo.homepage,
              name: manifest.name || repo.name,
              description: manifest.description || repo.description,
              author: manifest.author,
              organization: manifest.organization,
              source: 'github',
            });
          }
        }
      }
    }

    return results;
  } catch (error) {
    console.error('Error discovering from GitHub:', error);
    return [];
  }
}

/**
 * Fetch and parse agent manifest from URL
 */
export async function fetchAgentManifest(baseUrl: string): Promise<AgentManifest | null> {
  try {
    // Ensure URL has protocol
    let url = baseUrl;
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'https://' + url;
    }

    // Try to fetch manifest from /.well-known/agent.json
    const manifestUrl = url.endsWith('/')
      ? `${url}.well-known/agent.json`
      : `${url}/.well-known/agent.json`;

    const response = await fetch(manifestUrl, {
      headers: {
        'User-Agent': 'PulseRadar/1.0',
      },
      signal: AbortSignal.timeout(10000), // 10 second timeout
    });

    if (!response.ok) {
      return null;
    }

    const manifest: AgentManifest = await response.json();
    return manifest;
  } catch (error) {
    // Silently fail - endpoint might not be an x402 agent
    return null;
  }
}

/**
 * Save discovered endpoints to database
 */
export async function saveDiscoveredEndpoints(
  env: Env,
  discoveries: DiscoveryResult[]
): Promise<number> {
  let savedCount = 0;
  const now = Math.floor(Date.now() / 1000);

  for (const discovery of discoveries) {
    try {
      // Check if endpoint already exists
      const existing = await env.DB.prepare(
        'SELECT id FROM endpoints WHERE url = ?'
      ).bind(discovery.url).first();

      if (existing) {
        // Update last_seen_at
        await env.DB.prepare(
          'UPDATE endpoints SET last_seen_at = ?, is_active = 1 WHERE url = ?'
        ).bind(now, discovery.url).run();
      } else {
        // Insert new endpoint
        await env.DB.prepare(`
          INSERT INTO endpoints (
            url, name, description, author, organization,
            discovered_at, last_seen_at, discovery_source, is_active
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
        `).bind(
          discovery.url,
          discovery.name,
          discovery.description || null,
          discovery.author || null,
          discovery.organization || null,
          now,
          now,
          discovery.source
        ).run();

        savedCount++;
      }
    } catch (error) {
      console.error(`Error saving endpoint ${discovery.url}:`, error);
    }
  }

  return savedCount;
}

/**
 * Run full discovery process
 */
export async function runDiscovery(env: Env): Promise<{
  total_discovered: number;
  new_endpoints: number;
}> {
  console.log('Starting endpoint discovery...');

  // Discover from multiple sources
  const [x402Results, githubResults] = await Promise.all([
    discoverFromX402Scan(),
    discoverFromGitHub(),
  ]);

  const allDiscoveries = [...x402Results, ...githubResults];

  // Remove duplicates based on URL
  const uniqueDiscoveries = Array.from(
    new Map(allDiscoveries.map(d => [d.url, d])).values()
  );

  console.log(`Discovered ${uniqueDiscoveries.length} unique endpoints`);

  // Save to database
  const newCount = await saveDiscoveredEndpoints(env, uniqueDiscoveries);

  console.log(`Saved ${newCount} new endpoints to database`);

  return {
    total_discovered: uniqueDiscoveries.length,
    new_endpoints: newCount,
  };
}

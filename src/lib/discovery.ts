/**
 * Discovery Engine - Finds x402 endpoints from various sources
 *
 * TODO: Implement proper x402index.com integration with payment
 * - Use https://www.x402index.com/api/all with X-PAYMENT header
 * - Cost: $0.01 USDC per discovery run on Base network
 * - This is the official, maintained registry
 *
 * Current implementation uses free seed list + GitHub discovery as temporary workaround
 */

import type { Env, DiscoveryResult, AgentManifest } from '../types';

/**
 * Seed list of known x402 agents
 * TODO: Replace with x402index.com API once payment integration is implemented
 */
const KNOWN_X402_AGENTS = [
  // Your own services
  'https://pulseradar-proxy-production.up.railway.app',
  'https://gasroute-bounty-production.up.railway.app',

  // Known x402 ecosystem services
  'https://lending-liquidation-sentinel-production.up.railway.app',
  'https://yield-pool-watcher-production.up.railway.app',
  'https://lp-impermanent-loss-estimator-production-62b5.up.railway.app',
  'https://perps-funding-pulse-production.up.railway.app',
  'https://cross-dex-arbitrage-production.up.railway.app',
  'https://portfolio-scanner-production.up.railway.app',
  'https://pulseapi-production.up.railway.app',

  // Add more known agents here as discovered
];

/**
 * Discover endpoints from seed list
 * This is a temporary solution until x402index payment integration is complete
 */
export async function discoverFromSeedList(): Promise<DiscoveryResult[]> {
  const results: DiscoveryResult[] = [];

  console.log(`Checking ${KNOWN_X402_AGENTS.length} seed endpoints...`);

  for (const url of KNOWN_X402_AGENTS) {
    try {
      const manifest = await fetchAgentManifest(url);
      if (manifest) {
        results.push({
          url,
          name: manifest.name || 'Unknown Agent',
          description: manifest.description || null,
          author: manifest.author || null,
          organization: manifest.organization || null,
          source: 'seed_list',
        });
        console.log(`✓ Found: ${manifest.name} at ${url}`);
      } else {
        console.log(`✗ No manifest: ${url}`);
      }
    } catch (error) {
      console.error(`Error checking ${url}:`, error);
    }
  }

  console.log(`Seed list discovery: ${results.length}/${KNOWN_X402_AGENTS.length} active`);
  return results;
}

/**
 * Discover endpoints from x402 ecosystem pages (scraping fallback)
 * TODO: Remove once x402index.com integration is complete
 */
export async function discoverFromX402Ecosystem(): Promise<DiscoveryResult[]> {
  try {
    // Try to fetch x402.org ecosystem page
    const response = await fetch('https://www.x402.org/ecosystem', {
      headers: {
        'User-Agent': 'PulseRadar/1.0',
      },
    });

    if (!response.ok) {
      console.log('x402.org ecosystem page not accessible');
      return [];
    }

    const html = await response.text();
    const results: DiscoveryResult[] = [];

    // Extract URLs that look like x402 agents (basic regex)
    const urlPattern = /https?:\/\/[^\s<>"]+?(?:\.up\.railway\.app|\.workers\.dev|\.vercel\.app|\.herokuapp\.com)/g;
    const urls = [...new Set(html.match(urlPattern) || [])];

    console.log(`Found ${urls.length} potential endpoints on x402.org/ecosystem`);

    for (const url of urls.slice(0, 20)) { // Limit to 20 to avoid timeout
      try {
        const manifest = await fetchAgentManifest(url);
        if (manifest) {
          results.push({
            url,
            name: manifest.name || 'Unknown',
            description: manifest.description || null,
            author: manifest.author || null,
            organization: manifest.organization || null,
            source: 'x402_ecosystem',
          });
        }
      } catch (error) {
        // Silent fail - many URLs won't be x402 agents
      }
    }

    return results;
  } catch (error) {
    console.error('Error discovering from x402 ecosystem:', error);
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
 * TODO: Replace seed list with x402index.com API once payment integration is complete
 */
export async function runDiscovery(env: Env): Promise<{
  total_discovered: number;
  new_endpoints: number;
}> {
  console.log('Starting endpoint discovery...');
  console.log('⚠️  Using seed list + scraping (temporary workaround)');
  console.log('TODO: Integrate x402index.com API with payment');

  // Discover from multiple sources (temporary free methods)
  const [seedResults, ecosystemResults, githubResults] = await Promise.all([
    discoverFromSeedList(),
    discoverFromX402Ecosystem(),
    discoverFromGitHub(),
  ]);

  const allDiscoveries = [...seedResults, ...ecosystemResults, ...githubResults];

  // Remove duplicates based on URL
  const uniqueDiscoveries = Array.from(
    new Map(allDiscoveries.map(d => [d.url, d])).values()
  );

  console.log(`Discovered ${uniqueDiscoveries.length} unique endpoints`);
  console.log(`  - Seed list: ${seedResults.length}`);
  console.log(`  - Ecosystem: ${ecosystemResults.length}`);
  console.log(`  - GitHub: ${githubResults.length}`);

  // Save to database
  const newCount = await saveDiscoveredEndpoints(env, uniqueDiscoveries);

  console.log(`Saved ${newCount} new endpoints to database`);

  return {
    total_discovered: uniqueDiscoveries.length,
    new_endpoints: newCount,
  };
}

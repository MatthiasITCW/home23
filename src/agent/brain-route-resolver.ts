/**
 * Resolves the cosmo23 brainRoute for an agent at harness startup.
 * Called once from home.ts; result is cached on ToolContext for the
 * rest of the process lifetime.
 */

type FetchFn = typeof fetch;

interface Brain {
  id?: string;
  name?: string;
  path?: string;
}

interface ResolveOptions {
  fetchImpl?: FetchFn;
  retries?: number;
  retryDelayMs?: number;
  timeoutMs?: number;
}

const DEFAULT_RETRIES = 2;
const DEFAULT_RETRY_DELAY_MS = 2000;
const DEFAULT_TIMEOUT_MS = 5000;

export async function resolveBrainRoute(
  agentName: string,
  cosmo23BaseUrl: string,
  opts: ResolveOptions = {},
): Promise<string | null> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const retries = opts.retries ?? DEFAULT_RETRIES;
  const retryDelayMs = opts.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetchImpl(`${cosmo23BaseUrl}/api/brains`, {
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) {
        if (attempt < retries) { await sleep(retryDelayMs); continue; }
        return null;
      }
      const data = await res.json() as { brains?: Brain[] };
      const brains = data.brains ?? [];
      const match = findBrainForAgent(agentName, brains);
      if (!match?.id) return null;
      return `${cosmo23BaseUrl}/api/brain/${match.id}`;
    } catch {
      if (attempt < retries) { await sleep(retryDelayMs); continue; }
      return null;
    }
  }
  return null;
}

function findBrainForAgent(agentName: string, brains: Brain[]): Brain | undefined {
  const byName = brains.find(b => b.name === agentName);
  if (byName) return byName;
  return brains.find(b => typeof b.path === 'string' && b.path.includes(`/instances/${agentName}/brain`));
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

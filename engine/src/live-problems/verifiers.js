/**
 * Verifier catalog — deterministic checks for live problems.
 *
 * Each verifier takes `args` (problem-specific) + `ctx` (runtime helpers) and
 * returns { ok, detail, observed } synchronously or via Promise. Never throws —
 * internal errors return ok:false with detail describing the failure so the
 * problem stays tracked rather than silently disappearing.
 *
 * Adding a new verifier: add an entry here and it becomes usable in any
 * live-problems.json record. No dispatcher changes needed.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync, execSync } = require('child_process');

function expandPath(p) {
  if (!p) return p;
  if (p.startsWith('~')) return path.join(os.homedir(), p.slice(1));
  return p;
}

function minutesSince(ts) {
  return (Date.now() - ts) / 60000;
}

const verifiers = {
  /**
   * File has been modified within the last maxAgeMin minutes.
   * args: { path, maxAgeMin }
   */
  file_mtime({ path: p, maxAgeMin }) {
    try {
      const full = expandPath(p);
      if (!fs.existsSync(full)) {
        return { ok: false, detail: `missing: ${p}`, observed: { exists: false } };
      }
      const stat = fs.statSync(full);
      const ageMin = minutesSince(stat.mtimeMs);
      const ok = ageMin <= (maxAgeMin ?? 360);
      return {
        ok,
        detail: ok
          ? `fresh (${ageMin.toFixed(1)} min old)`
          : `stale (${ageMin.toFixed(1)} min old, threshold ${maxAgeMin})`,
        observed: { mtime: stat.mtime.toISOString(), ageMin },
      };
    } catch (err) {
      return { ok: false, detail: `stat failed: ${err.message}` };
    }
  },

  /**
   * File exists (and optionally is non-empty).
   * args: { path, minBytes }
   */
  file_exists({ path: p, minBytes }) {
    try {
      const full = expandPath(p);
      if (!fs.existsSync(full)) return { ok: false, detail: `missing: ${p}` };
      if (minBytes !== undefined) {
        const stat = fs.statSync(full);
        if (stat.size < minBytes) {
          return { ok: false, detail: `too small (${stat.size} < ${minBytes})`, observed: { size: stat.size } };
        }
      }
      return { ok: true, detail: 'exists' };
    } catch (err) {
      return { ok: false, detail: `stat failed: ${err.message}` };
    }
  },

  /**
   * PM2 process is online (or any matching the name glob is online).
   * args: { name }
   */
  pm2_status({ name }) {
    if (!name) return { ok: false, detail: 'name required' };
    try {
      const out = execFileSync('pm2', ['jlist'], { encoding: 'utf8', timeout: 8000 });
      const list = JSON.parse(out);
      const matches = list.filter(p => p.name === name);
      if (matches.length === 0) {
        return { ok: false, detail: `not registered: ${name}` };
      }
      const online = matches.filter(p => p.pm2_env?.status === 'online');
      if (online.length === 0) {
        const statuses = matches.map(p => p.pm2_env?.status || '?').join(',');
        return { ok: false, detail: `status=${statuses}`, observed: { statuses } };
      }
      return { ok: true, detail: 'online', observed: { restarts: online[0].pm2_env?.restart_time } };
    } catch (err) {
      return { ok: false, detail: `pm2 jlist failed: ${err.message}` };
    }
  },

  /**
   * HTTP GET returns 2xx within timeoutMs.
   * args: { url, timeoutMs, expectStatus }
   */
  async http_ping({ url, timeoutMs = 5000, expectStatus }) {
    if (!url) return { ok: false, detail: 'url required' };
    const controller = new AbortController();
    const to = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { signal: controller.signal });
      const status = res.status;
      const expected = expectStatus ?? 200;
      const ok = Array.isArray(expected)
        ? expected.includes(status)
        : (typeof expected === 'number' ? status === expected : status >= 200 && status < 300);
      return {
        ok,
        detail: ok ? `${status}` : `unexpected status ${status}`,
        observed: { status },
      };
    } catch (err) {
      return { ok: false, detail: `fetch failed: ${err.message}` };
    } finally {
      clearTimeout(to);
    }
  },

  /**
   * Mount has >= minGiB free.
   * args: { mount, minGiB }
   */
  disk_free({ mount = '/', minGiB = 5 }) {
    try {
      const out = execSync(`df -g ${JSON.stringify(mount)}`, { encoding: 'utf8', timeout: 5000 });
      const lines = out.trim().split('\n');
      if (lines.length < 2) return { ok: false, detail: 'df output unparseable' };
      const cols = lines[1].split(/\s+/);
      // macOS df -g columns: Filesystem Size Used Avail Capacity iused ifree %iused Mounted
      const availGi = parseFloat(cols[3]);
      if (isNaN(availGi)) return { ok: false, detail: `cannot parse avail from: ${lines[1]}` };
      const ok = availGi >= minGiB;
      return {
        ok,
        detail: ok ? `${availGi}GiB free` : `only ${availGi}GiB free (need ${minGiB})`,
        observed: { availGi },
      };
    } catch (err) {
      return { ok: false, detail: `df failed: ${err.message}` };
    }
  },

  /**
   * Brain graph has >= minNodes nodes. Uses the memory instance if provided.
   * args: { minNodes }
   */
  graph_not_empty({ minNodes = 1 }, ctx = {}) {
    const memory = ctx.memory;
    if (!memory || !memory.nodes) return { ok: false, detail: 'no memory ref' };
    const count = memory.nodes.size || memory.nodes.length || 0;
    const ok = count >= minNodes;
    return {
      ok,
      detail: ok ? `${count} nodes` : `only ${count} nodes (need ${minNodes})`,
      observed: { count },
    };
  },

  /**
   * Node count has not regressed more than `dropThreshold` (0..1) below the
   * all-time high-water mark. High-water tracked in brain/brain-high-water.json
   * and updated whenever current exceeds it. Needs memory + brainDir in ctx.
   *
   * Useful for catching silent data loss (save-side regressions, in-process
   * pruning bugs, cluster-sync issues) that the 50%-drop save safeguard
   * wouldn't trip on their own.
   *
   * args: { dropThreshold, minBaseline }
   */
  node_count_stable({ dropThreshold = 0.1, minBaseline = 100 }, ctx = {}) {
    const memory = ctx.memory;
    const brainDir = ctx.brainDir;
    if (!memory?.nodes) return { ok: false, detail: 'no memory ref' };
    if (!brainDir) return { ok: false, detail: 'no brainDir in ctx' };

    const current = memory.nodes.size ?? memory.nodes.length ?? 0;
    const hwFile = path.join(brainDir, 'brain-high-water.json');

    let hw = { maxNodeCount: 0, lastSeen: null };
    try {
      const raw = fs.readFileSync(hwFile, 'utf8');
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.maxNodeCount === 'number') hw = parsed;
    } catch { /* first run or bad file */ }

    // Update high-water when current is a new maximum.
    if (current > hw.maxNodeCount) {
      const next = { maxNodeCount: current, lastSeen: new Date().toISOString() };
      try {
        fs.writeFileSync(hwFile + '.tmp', JSON.stringify(next, null, 2));
        fs.renameSync(hwFile + '.tmp', hwFile);
      } catch { /* advisory — don't block verification */ }
      hw = next;
    }

    // Not enough baseline — treat as ok, keep collecting data.
    if (hw.maxNodeCount < minBaseline) {
      return {
        ok: true,
        detail: `building baseline (${current} nodes, high-water ${hw.maxNodeCount})`,
        observed: { current, highWater: hw.maxNodeCount },
      };
    }

    const floor = Math.floor(hw.maxNodeCount * (1 - dropThreshold));
    const ok = current >= floor;
    return {
      ok,
      detail: ok
        ? `stable (${current} nodes, high-water ${hw.maxNodeCount})`
        : `regression: ${current} nodes, dropped below ${floor} (high-water ${hw.maxNodeCount})`,
      observed: { current, highWater: hw.maxNodeCount, floor },
    };
  },
};

function listVerifierTypes() {
  return Object.keys(verifiers);
}

async function runVerifier(spec, ctx) {
  if (!spec || !spec.type) return { ok: false, detail: 'missing verifier spec' };
  const fn = verifiers[spec.type];
  if (!fn) return { ok: false, detail: `unknown verifier type: ${spec.type}` };
  try {
    const out = await fn(spec.args || {}, ctx || {});
    return out;
  } catch (err) {
    return { ok: false, detail: `verifier threw: ${err.message}` };
  }
}

module.exports = { runVerifier, listVerifierTypes, verifiers };

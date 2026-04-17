/**
 * done-when.js — goal-completion verifier.
 *
 * Every goal carries a `doneWhen.criteria` array. Each criterion is a
 * concrete, checkable condition. This module dispatches each criterion to
 * a primitive handler and returns whether it passed.
 *
 * Non-LLM primitives (this file) are synchronous-ish and cheap. The
 * LLM-based `judged` primitive lives alongside but has its own caching
 * contract (added in Task 2).
 *
 * env shape:
 *   { memory, logger, outputsDir, brainDir, llmClient? }
 */

const fs = require('fs');
const path = require('path');

function resolveSafe(baseDir, relPath) {
  const full = path.resolve(baseDir, relPath);
  const rel = path.relative(baseDir, full);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    return null;
  }
  return full;
}

async function checkFileExists(crit, env) {
  const resolved = resolveSafe(env.outputsDir, crit.path);
  if (!resolved) return { passed: false, note: 'path outside outputsDir' };
  return { passed: fs.existsSync(resolved), note: resolved };
}

async function checkFileCreatedAfter(crit, env) {
  const resolved = resolveSafe(env.outputsDir, crit.path);
  if (!resolved) return { passed: false, note: 'path outside outputsDir' };
  if (!fs.existsSync(resolved)) return { passed: false, note: 'missing' };
  const stat = fs.statSync(resolved);
  const since = typeof crit.since === 'string' ? Date.parse(crit.since) : Number(crit.since);
  return { passed: stat.mtimeMs > since, note: `mtime=${stat.mtimeMs} since=${since}` };
}

async function checkMemoryNodeTagged(crit, env) {
  const tag = String(crit.tag || '').toLowerCase();
  if (!tag) return { passed: false, note: 'empty tag' };
  if (!env.memory?.nodes) return { passed: false, note: 'no memory' };
  for (const node of env.memory.nodes.values()) {
    if (String(node.tag || '').toLowerCase() === tag) {
      return { passed: true, note: `node id=${node.id}` };
    }
  }
  return { passed: false, note: 'no matching node' };
}

async function checkMemoryNodeMatches(crit, env) {
  if (!crit.regex) return { passed: false, note: 'no regex' };
  if (!env.memory?.nodes) return { passed: false, note: 'no memory' };
  let re;
  try { re = new RegExp(crit.regex, 'i'); }
  catch (err) { return { passed: false, note: `bad regex: ${err.message}` }; }
  for (const node of env.memory.nodes.values()) {
    if (re.test(node.concept || '')) {
      return { passed: true, note: `node id=${node.id}` };
    }
  }
  return { passed: false, note: 'no matching concept' };
}

async function checkOutputCountSince(crit, env) {
  const baseDir = crit.dir === '.' || !crit.dir ? env.outputsDir
    : resolveSafe(env.outputsDir, crit.dir);
  if (!baseDir) return { passed: false, note: 'dir outside outputsDir' };
  if (!fs.existsSync(baseDir)) return { passed: false, note: 'dir missing' };
  const since = typeof crit.since === 'string' ? Date.parse(crit.since) : Number(crit.since);
  const gte = Number(crit.gte) || 1;
  let count = 0;
  for (const name of fs.readdirSync(baseDir)) {
    const full = path.join(baseDir, name);
    const st = fs.statSync(full);
    if (st.isFile() && st.mtimeMs > since) count++;
  }
  return { passed: count >= gte, note: `count=${count} gte=${gte}` };
}

const DISPATCH = {
  file_exists: checkFileExists,
  file_created_after: checkFileCreatedAfter,
  memory_node_tagged: checkMemoryNodeTagged,
  memory_node_matches: checkMemoryNodeMatches,
  output_count_since: checkOutputCountSince,
};

async function checkCriterion(crit, env) {
  const handler = DISPATCH[crit?.type];
  if (!handler) return { passed: false, note: `unknown type: ${crit?.type}` };
  try {
    return await handler(crit, env);
  } catch (err) {
    return { passed: false, note: `handler error: ${err.message}` };
  }
}

module.exports = { checkCriterion, DISPATCH };

'use strict';

const fs = require('fs');
const path = require('path');

function buildGoodLifeSnapshot({
  runtimeRoot,
  workspacePath,
  orchestrator,
  memory,
  goals,
} = {}) {
  const now = new Date().toISOString();
  return {
    now,
    memory: {
      nodes: sizeOf(memory?.nodes),
      edges: sizeOf(memory?.edges),
    },
    liveProblems: summarizeLiveProblems(orchestrator, runtimeRoot),
    goals: summarizeGoals(goals),
    agenda: summarizeAgenda(runtimeRoot),
    crystallization: summarizeJsonl(path.join(runtimeRoot || '', 'crystallization-receipts.jsonl')),
    discovery: orchestrator?.discoveryEngine?.getStats?.() || null,
    thinkingMachine: orchestrator?.thinkingMachine?.getStats?.() || null,
    publish: summarizePublish(runtimeRoot),
    surfaces: summarizeSurfaces(workspacePath),
    sleep: {
      active: Boolean(orchestrator?.sleepSession?.active),
      startCycle: orchestrator?.sleepSession?.startCycle ?? null,
    },
    crashRecovery: {
      crashDetected: Boolean(orchestrator?.crashRecovery?.crashDetected),
    },
    actions: summarizeActions(orchestrator),
  };
}

function summarizeLiveProblems(orchestrator, runtimeRoot) {
  const list = orchestrator?.liveProblems?.store?.all?.()
    || readJson(path.join(runtimeRoot || '', 'live-problems.json'))?.problems
    || [];
  const out = { open: 0, chronic: 0, resolved: 0, unverifiable: 0, total: 0 };
  for (const p of Array.isArray(list) ? list : []) {
    out.total++;
    if (p.state === 'open') out.open++;
    else if (p.state === 'chronic') out.chronic++;
    else if (p.state === 'resolved') out.resolved++;
    else if (p.state === 'unverifiable') out.unverifiable++;
  }
  return out;
}

function summarizeGoals(goals) {
  const list = typeof goals?.getGoals === 'function' ? goals.getGoals() : [];
  let open = 0;
  let complete = 0;
  for (const g of Array.isArray(list) ? list : []) {
    if (g?.status === 'complete' || g?.completed) complete++;
    else open++;
  }
  return { open, complete, total: open + complete };
}

function summarizeAgenda(runtimeRoot) {
  const file = path.join(runtimeRoot || '', 'agenda.jsonl');
  const rows = tailJsonl(file, 200);
  let pending = 0;
  let actedOn = 0;
  for (const row of rows) {
    if (row.status === 'acted_on') actedOn++;
    else if (!row.status || row.status === 'pending') pending++;
  }
  return { pending, actedOn, sampled: rows.length };
}

function summarizePublish(runtimeRoot) {
  const file = path.join(runtimeRoot || '', 'publish-ledger.jsonl');
  const stat = statIso(file);
  const rows = tailJsonl(file, 200);
  const useful = rows
    .filter((r) => ['workspace_insights', 'dashboard', 'bridge_chat', 'dream_log', 'signals'].includes(r.target || r.kind))
    .slice(-1)[0];
  return {
    lastLedgerWriteAt: stat,
    lastUsefulOutputAt: toIsoTime(useful?.at || useful?.timestamp || stat),
    sampled: rows.length,
  };
}

function summarizeSurfaces(workspacePath) {
  if (!workspacePath) return {};
  return {
    nowUpdatedAt: statIso(path.join(workspacePath, 'NOW.md')),
    heartbeatUpdatedAt: statIso(path.join(workspacePath, 'HEARTBEAT.md')),
    projectsUpdatedAt: statIso(path.join(workspacePath, 'PROJECTS.md')),
    topologyUpdatedAt: statIso(path.join(workspacePath, 'TOPOLOGY.md')),
  };
}

function summarizeActions(orchestrator) {
  const journal = Array.isArray(orchestrator?.journal) ? orchestrator.journal.slice(-40) : [];
  let recentFailures = 0;
  let maintenance = 0;
  for (const j of journal) {
    const text = String(j?.thought || j?.reasoning || '').toLowerCase();
    if (text.includes('failed') || text.includes('error') || text.includes('timeout')) recentFailures++;
    if (text.includes('restart') || text.includes('maintenance') || text.includes('self') || text.includes('engine')) maintenance++;
  }
  return {
    recentFailures,
    maintenanceRatio: journal.length ? maintenance / journal.length : 0,
  };
}

function summarizeJsonl(file) {
  const rows = tailJsonl(file, 20);
  const last = rows[rows.length - 1] || null;
  return {
    countSampled: rows.length,
    lastReceiptAt: toIsoTime(last?.at || last?.timestamp || statIso(file)),
  };
}

function tailJsonl(file, limit) {
  try {
    if (!file || !fs.existsSync(file)) return [];
    const lines = fs.readFileSync(file, 'utf8').trim().split('\n').filter(Boolean);
    return lines.slice(-limit).map((line) => {
      try { return JSON.parse(line); } catch { return null; }
    }).filter(Boolean);
  } catch {
    return [];
  }
}

function readJson(file) {
  try {
    if (!file || !fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function statIso(file) {
  try {
    if (!file || !fs.existsSync(file)) return null;
    return fs.statSync(file).mtime.toISOString();
  } catch {
    return null;
  }
}

function toIsoTime(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'number') {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  if (typeof value === 'string') {
    const t = Date.parse(value);
    if (!Number.isNaN(t)) return new Date(t).toISOString();
  }
  return null;
}

function sizeOf(maybeMap) {
  if (!maybeMap) return 0;
  if (typeof maybeMap.size === 'number') return maybeMap.size;
  if (Array.isArray(maybeMap)) return maybeMap.length;
  if (typeof maybeMap === 'object') return Object.keys(maybeMap).length;
  return 0;
}

module.exports = { buildGoodLifeSnapshot };

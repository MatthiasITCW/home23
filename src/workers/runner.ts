import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { loadWorker } from './registry.js';
import { writeWorkerReceipt } from './receipts.js';
import type { ToolContext, ToolDefinition } from '../agent/types.js';
import type { WorkerRunReceipt, WorkerRunRequest } from './types.js';

const activeOwners = new Set<string>();

export interface RunWorkerInput {
  projectRoot: string;
  request: WorkerRunRequest;
  ctx: ToolContext;
  tools?: ToolDefinition[];
}

export interface RunWorkerResult {
  runId: string;
  runPath: string;
  receipt: WorkerRunReceipt;
}

function makeRunId(worker: string, now = new Date()): string {
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const suffix = Math.random().toString(16).slice(2, 6);
  return `wr_${stamp}_${worker}_${suffix}`;
}

function readIfExists(filePath: string): string {
  return existsSync(filePath) ? readFileSync(filePath, 'utf8') : '';
}

function workerSystemPrompt(workerName: string, identity: string, playbook: string): string {
  return [
    `You are the reusable Home23 worker named ${workerName}.`,
    '',
    identity,
    '',
    playbook,
    '',
    'Return concise findings with evidence. Do not claim success unless a concrete verifier or equivalent check passed.',
    'End with machine-readable lines when possible:',
    'VERIFIER_STATUS: pass|fail|unknown',
    'DISPATCH_OUTCOME: fixed|failed|blocked|unknown|not_fixed',
    'SUMMARY: <one sentence>'
  ].join('\n');
}

function workerMission(systemPrompt: string, prompt: string): string {
  return [
    '[HOME23 WORKER CONTEXT]',
    systemPrompt,
    '',
    '[WORKER TASK]',
    prompt
  ].join('\n');
}

function parseVerifierStatus(text: string): WorkerRunReceipt['verifierStatus'] {
  const explicit = text.match(/VERIFIER_STATUS:\s*(pass|fail|unknown|not_run)/i)?.[1]?.toLowerCase();
  if (explicit === 'pass' || explicit === 'fail' || explicit === 'unknown' || explicit === 'not_run') return explicit;
  if (/verifier:\s*pass/i.test(text) || /\bverifier(?: now)? passes\b/i.test(text)) return 'pass';
  if (/verifier:\s*fail/i.test(text) || /\bverifier(?: still)? fails\b/i.test(text)) return 'fail';
  return 'unknown';
}

function parseStatus(text: string, verifierStatus: WorkerRunReceipt['verifierStatus']): WorkerRunReceipt['status'] {
  const explicit = text.match(/DISPATCH_OUTCOME:\s*(fixed|failed|blocked|unknown|not_fixed)/i)?.[1]?.toLowerCase();
  if (explicit === 'fixed') return 'fixed';
  if (explicit === 'failed' || explicit === 'not_fixed') return 'failed';
  if (explicit === 'blocked') return 'blocked';
  if (verifierStatus === 'pass' && /\bfixed\b/i.test(text)) return 'fixed';
  if (/\bblocked\b/i.test(text)) return 'blocked';
  if (/\bfailed\b|\berror\b/i.test(text)) return 'failed';
  return 'no_change';
}

function parseSummary(text: string): string {
  const summary = text.match(/SUMMARY:\s*(.+)$/im)?.[1]?.trim()
    || text.match(/Summary:\s*(.+)$/im)?.[1]?.trim()
    || text.split('\n').find(line => line.trim())?.trim()
    || 'Worker run completed.';
  return summary.slice(0, 500);
}

function receiptFromResponse(args: {
  request: WorkerRunRequest;
  runId: string;
  runPath: string;
  workerName: string;
  ownerAgent: string;
  startedAt: string;
  finishedAt: string;
  responseText: string;
}): WorkerRunReceipt {
  const verifierStatus = parseVerifierStatus(args.responseText);
  const status = parseStatus(args.responseText, verifierStatus);
  const summary = parseSummary(args.responseText);
  return {
    schema: 'home23.worker-run.v1',
    runId: args.runId,
    worker: args.workerName,
    ownerAgent: args.ownerAgent,
    requestedBy: args.request.requestedBy,
    requester: args.request.requester,
    startedAt: args.startedAt,
    finishedAt: args.finishedAt,
    status,
    verifierStatus,
    summary,
    actions: [],
    evidence: [{ type: 'worker_response', detail: summary, status: verifierStatus }],
    artifacts: [path.join(args.runPath, 'transcript.md')],
    memoryCandidates: [],
    source: args.request.source
  };
}

export async function runWorker(input: RunWorkerInput): Promise<RunWorkerResult> {
  const worker = loadWorker(input.projectRoot, input.request.worker);
  const owner = input.request.ownerAgent || worker.ownerAgent;
  if (activeOwners.has(owner)) throw new Error(`Worker run already active for owner ${owner}`);
  if (!input.ctx.runAgentLoop) throw new Error('Worker runner requires runAgentLoop in ToolContext');

  activeOwners.add(owner);
  try {
    const id = makeRunId(worker.name);
    const runPath = path.join(worker.rootPath, 'runs', id);
    mkdirSync(runPath, { recursive: true });

    const startedAt = new Date().toISOString();
    const identity = readIfExists(path.join(worker.rootPath, 'workspace', 'IDENTITY.md'));
    const playbook = readIfExists(path.join(worker.rootPath, 'workspace', 'PLAYBOOK.md'));
    const systemPrompt = workerSystemPrompt(worker.name, identity, playbook);
    const mission = workerMission(systemPrompt, input.request.prompt);

    writeFileSync(path.join(runPath, 'input.md'), input.request.prompt);
    const response = await input.ctx.runAgentLoop(systemPrompt, mission, input.tools || [], {
      ...input.ctx,
      agentName: owner,
      workspacePath: path.join(worker.rootPath, 'workspace'),
      chatId: `worker:${worker.name}:${id}`
    });
    const finishedAt = new Date().toISOString();
    writeFileSync(path.join(runPath, 'transcript.md'), response.text);

    const receipt = receiptFromResponse({
      request: { ...input.request, ownerAgent: owner },
      runId: id,
      runPath,
      workerName: worker.name,
      ownerAgent: owner,
      startedAt,
      finishedAt,
      responseText: response.text
    });
    writeWorkerReceipt(input.projectRoot, runPath, receipt);
    return { runId: id, runPath, receipt };
  } finally {
    activeOwners.delete(owner);
  }
}

import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { runWorker } from '../../src/workers/runner.js';
import type { AgentLoopRunner, ToolContext } from '../../src/agent/types.js';

function seedWorker(projectRoot: string) {
  const dir = path.join(projectRoot, 'instances', 'workers', 'systems');
  mkdirSync(path.join(dir, 'workspace'), { recursive: true });
  mkdirSync(path.join(dir, 'runs'), { recursive: true });
  writeFileSync(path.join(dir, 'worker.yaml'), [
    'kind: worker',
    'name: systems',
    'displayName: Systems',
    'ownerAgent: jerry',
    'class: ops',
    'purpose: Diagnose systems issues.',
    'limits:',
    '  maxRuntimeMinutes: 45'
  ].join('\n'));
  writeFileSync(path.join(dir, 'workspace', 'IDENTITY.md'), '# Systems\n');
  writeFileSync(path.join(dir, 'workspace', 'PLAYBOOK.md'), '# Playbook\n');
}

function fakeContext(projectRoot: string, loop: AgentLoopRunner): ToolContext {
  return {
    scheduler: null,
    ttsService: null,
    browser: null,
    projectRoot,
    enginePort: 5001,
    agentName: 'jerry',
    cosmo23BaseUrl: 'http://localhost:43210',
    brainRoute: null,
    workspacePath: path.join(projectRoot, 'instances', 'jerry', 'workspace'),
    tempDir: path.join(projectRoot, '.tmp'),
    contextManager: {
      getSystemPrompt: () => 'house prompt',
      getPromptSourceInfo: () => ({ generatedAt: new Date().toISOString(), totalSections: 0, loadedFiles: [] }),
      invalidate: () => undefined
    },
    subAgentTracker: { active: 0, maxConcurrent: 1, queue: [] },
    chatId: 'test',
    telegramAdapter: null,
    runAgentLoop: loop
  };
}

test('runWorker writes input, transcript, receipt, and owner brain feed', async () => {
  const projectRoot = mkdtempSync(path.join(tmpdir(), 'home23-runner-'));
  seedWorker(projectRoot);
  const loop: AgentLoopRunner = async (systemPrompt, userMessage) => {
    assert.match(systemPrompt, /Systems/);
    assert.match(userMessage, /\[COLLABORATION HANDOFF\]/);
    assert.match(userMessage, /Why this matters:/);
    assert.match(userMessage, /What would be technically correct but wrong for Home23/);
    assert.match(userMessage, /Check PM2/);
    return { text: 'Summary: checked scoped PM2 state\nVerifier: pass', model: 'fake', toolCallCount: 0, durationMs: 5 };
  };

  const result = await runWorker({
    projectRoot,
    request: { worker: 'systems', prompt: 'Check PM2', requestedBy: 'api' },
    ctx: fakeContext(projectRoot, loop)
  });

  assert.equal(result.receipt.worker, 'systems');
  assert.equal(result.receipt.ownerAgent, 'jerry');
  assert.equal(result.receipt.status, 'no_change');
  assert.equal(result.receipt.verifierStatus, 'pass');
  assert.equal(result.receipt.collaborationHandoff?.schema, 'home23.worker-collaboration-handoff.v1');
  assert.deepEqual(result.receipt.collaborationHandoff?.sourceIssues, [78]);
  assert.equal(existsSync(path.join(result.runPath, 'input.md')), true);
  assert.match(readFileSync(path.join(result.runPath, 'input.md'), 'utf8'), /\[COLLABORATION HANDOFF\]/);
  assert.equal(existsSync(path.join(result.runPath, 'transcript.md')), true);
  assert.equal(existsSync(path.join(result.runPath, 'receipt.json')), true);
  assert.match(readFileSync(path.join(projectRoot, 'instances', 'jerry', 'brain', 'worker-runs.jsonl'), 'utf8'), /checked scoped PM2 state/);
});

test('runWorker treats read-only verifier pass as no_change even when no fix was needed', async () => {
  const projectRoot = mkdtempSync(path.join(tmpdir(), 'home23-runner-'));
  seedWorker(projectRoot);
  const loop: AgentLoopRunner = async () => ({
    text: [
      'Read-only check complete.',
      'VERIFIER_STATUS: pass',
      'DISPATCH_OUTCOME: not_fixed',
      'SUMMARY: Endpoint responds and no process change was needed.'
    ].join('\n'),
    model: 'fake',
    toolCallCount: 0,
    durationMs: 5
  });

  const result = await runWorker({
    projectRoot,
    request: { worker: 'systems', prompt: 'Check endpoint only', requestedBy: 'api' },
    ctx: fakeContext(projectRoot, loop)
  });

  assert.equal(result.receipt.verifierStatus, 'pass');
  assert.equal(result.receipt.status, 'no_change');
});

test('runWorker preserves explicit collaboration handoff intent', async () => {
  const projectRoot = mkdtempSync(path.join(tmpdir(), 'home23-runner-'));
  seedWorker(projectRoot);
  const loop: AgentLoopRunner = async (_systemPrompt, userMessage) => {
    assert.match(userMessage, /Why this matters: The shape matters more than the literal task/);
    assert.match(userMessage, /Keep the existing operator tone/);
    assert.match(userMessage, /Would jtr reject this as technically correct but wrong/);
    return { text: 'SUMMARY: handoff preserved\nVERIFIER_STATUS: pass\nDISPATCH_OUTCOME: not_fixed', model: 'fake', toolCallCount: 0, durationMs: 5 };
  };

  const result = await runWorker({
    projectRoot,
    request: {
      worker: 'systems',
      prompt: 'Review the operator tile',
      requestedBy: 'human',
      collaborationHandoff: {
        sourceIssues: [78, 99],
        whyThisMatters: 'The shape matters more than the literal task.',
        constraints: ['Keep the existing operator tone.'],
        reviewLens: ['Would jtr reject this as technically correct but wrong?'],
        handoffTaxMitigation: 'State any drift before claiming completion.'
      }
    },
    ctx: fakeContext(projectRoot, loop)
  });

  assert.deepEqual(result.receipt.collaborationHandoff?.sourceIssues, [78, 99]);
  assert.equal(result.receipt.collaborationHandoff?.constraints[0], 'Keep the existing operator tone.');
});

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { launchTool } from '../../../src/agent/tools/research.js';
import type { ToolContext } from '../../../src/agent/types.js';

function makeCtx(overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    scheduler: null,
    ttsService: null,
    browser: null,
    projectRoot: '/fake',
    enginePort: 5002,
    agentName: 'jerry',
    cosmo23BaseUrl: 'http://localhost:43210',
    brainRoute: 'http://localhost:43210/api/brain/abc123',
    workspacePath: '/fake/instances/jerry/workspace',
    tempDir: '/tmp',
    contextManager: {
      getSystemPrompt: () => '',
      getPromptSourceInfo: () => ({ generatedAt: '', totalSections: 0, loadedFiles: [] }),
      invalidate: () => {},
    },
    subAgentTracker: { active: 0, maxConcurrent: 3, queue: [] },
    chatId: '',
    telegramAdapter: null,
    runAgentLoop: null,
    ...overrides,
  };
}

describe('research_launch', () => {
  it('sends runName + runRoot + owner derived from ctx.workspacePath and ctx.agentName', async () => {
    let capturedBody: any;
    (globalThis as any).fetch = async (url: any, init: any) => {
      const u = String(url);
      if (u.endsWith('/api/status')) {
        return { ok: true, json: async () => ({ running: false }) } as unknown as Response;
      }
      if (u.endsWith('/api/launch')) {
        capturedBody = JSON.parse(init.body);
        return {
          ok: true,
          json: async () => ({ success: true, runName: capturedBody.runName, brainId: 'b1', cycles: 10 }),
        } as unknown as Response;
      }
      return { ok: true, json: async () => ({}) } as unknown as Response;
    };

    await launchTool.execute({ topic: 'sauna HRV correlation' }, makeCtx());

    assert.match(capturedBody.runName, /^sauna-hrv-correlation-\d{14}$/);
    assert.equal(capturedBody.runRoot, '/fake/instances/jerry/workspace/research-runs/' + capturedBody.runName);
    assert.equal(capturedBody.owner, 'jerry');
    assert.equal(capturedBody.topic, 'sauna HRV correlation');
  });
});

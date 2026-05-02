import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const express = require('express');
const yaml = require('js-yaml');
const { createSettingsRouter } = require('../../../engine/src/dashboard/home23-settings-api.js');

async function withSettingsServer(homeConfig, fn) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'home23-vibe-settings-'));
  fs.mkdirSync(path.join(root, 'config'), { recursive: true });
  fs.writeFileSync(path.join(root, 'config', 'home.yaml'), yaml.dump(homeConfig), 'utf8');

  const app = express();
  app.use(express.json());
  app.use('/home23/api/settings', createSettingsRouter(root).router);
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();

  try {
    await fn(`http://127.0.0.1:${port}`, root);
  } finally {
    await new Promise((resolve, reject) => server.close((err) => err ? reject(err) : resolve()));
    fs.rmSync(root, { recursive: true, force: true });
  }
}

test('vibe settings expose and preserve xAI Grok image models', async () => {
  await withSettingsServer({
    dashboard: { vibe: { autoGenerate: true } },
    media: {
      imageGeneration: {
        provider: 'xai',
        model: 'grok-imagine-image-pro',
      },
    },
  }, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/home23/api/settings/vibe`);
    assert.equal(res.status, 200);
    const body = await res.json();

    assert.deepEqual(body.imageProviders.xai.models, [
      'grok-imagine-image',
      'grok-imagine-image-pro',
    ]);
    assert.deepEqual(body.imageGeneration, {
      provider: 'xai',
      model: 'grok-imagine-image-pro',
    });
  });
});

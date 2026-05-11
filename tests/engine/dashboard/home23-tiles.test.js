import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  CORE_TILES,
  normalizeDashboardTilesConfig,
  materializeHomeLayout,
  materializeHomeLayoutForContext,
} = require('../../../engine/src/dashboard/home23-tiles.js');

test('Good Life is a core tile for every agent dashboard', () => {
  const tile = CORE_TILES.find((candidate) => candidate.id === 'good-life');

  assert.ok(tile, 'good-life must be registered as a core tile');
  assert.equal(tile.kind, 'core');
  assert.equal(tile.mode, 'core-good-life');
  assert.equal(tile.sizeDefault, 'full');
});

test('dashboard tile normalization appends Good Life to older layouts', () => {
  const normalized = normalizeDashboardTilesConfig({
    homeLayout: [
      { tileId: 'thought-feed', enabled: true, size: 'third' },
      { tileId: 'chat', enabled: true, size: 'third' },
    ],
    customTiles: [],
  });
  const item = normalized.homeLayout.find((layoutItem) => layoutItem.tileId === 'good-life');

  assert.ok(item, 'good-life must be inserted when an existing layout is missing it');
  assert.equal(item.enabled, true);
  assert.equal(item.size, 'full');
});

test('materialized default layout exposes Good Life as a core tile', () => {
  const normalized = normalizeDashboardTilesConfig({});
  const materialized = materializeHomeLayout(normalized);
  const item = materialized.find((layoutItem) => layoutItem.tileId === 'good-life');

  assert.ok(item, 'default materialized layout must include good-life');
  assert.equal(item.enabled, true);
  assert.equal(item.tile.kind, 'core');
  assert.equal(item.tile.mode, 'core-good-life');
});

test('family-evening context suppresses project-facing home tiles without mutating layout', () => {
  const normalized = normalizeDashboardTilesConfig({});
  const normalLayout = materializeHomeLayout(normalized);
  const contextual = materializeHomeLayoutForContext(normalized, {
    mode: 'family-evening',
    active: true,
  });

  assert.ok(normalLayout.some((item) => item.tileId === 'thought-feed'));
  assert.ok(normalLayout.some((item) => item.tileId === 'brain-log'));
  assert.ok(!contextual.layout.some((item) => item.tileId === 'thought-feed'));
  assert.ok(!contextual.layout.some((item) => item.tileId === 'brain-log'));
  assert.ok(contextual.layout.some((item) => item.tileId === 'system-summary'));
  assert.ok(contextual.layout.some((item) => item.tileId === 'good-life'));
  assert.deepEqual(contextual.hiddenTiles.map((item) => item.tileId).sort(), [
    'brain-log',
    'chat',
    'dream-log',
    'feeder',
    'thought-feed',
    'vibe',
  ]);
  assert.ok(normalized.homeLayout.some((item) => item.tileId === 'thought-feed'));
});

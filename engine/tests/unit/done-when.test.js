/**
 * done-when.js primitive tests.
 * Each primitive is a pure function given an env object.
 * LLM-based `judged` primitive is tested separately in Task 2.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { expect } = require('chai');
const { checkCriterion } = require('../../src/goals/done-when');

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'done-when-'));
}

function mkNode(id, concept, tag) {
  return { id, concept, tag, created: new Date().toISOString() };
}

function makeEnv({ outputsDir, brainDir, nodes = [] } = {}) {
  const memory = { nodes: new Map(nodes.map(n => [n.id, n])) };
  return {
    memory,
    logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
    outputsDir: outputsDir || tmpDir(),
    brainDir: brainDir || tmpDir(),
  };
}

describe('done-when primitives', () => {
  describe('file_exists', () => {
    it('passes when file exists under outputsDir', async () => {
      const env = makeEnv();
      fs.writeFileSync(path.join(env.outputsDir, 'foo.md'), 'x');
      const result = await checkCriterion({ type: 'file_exists', path: 'foo.md' }, env);
      expect(result.passed).to.equal(true);
    });

    it('fails when file missing', async () => {
      const env = makeEnv();
      const result = await checkCriterion({ type: 'file_exists', path: 'missing.md' }, env);
      expect(result.passed).to.equal(false);
    });

    it('rejects path escaping outputsDir', async () => {
      const env = makeEnv();
      const result = await checkCriterion({ type: 'file_exists', path: '../../etc/passwd' }, env);
      expect(result.passed).to.equal(false);
      expect(result.note).to.match(/outside/i);
    });
  });

  describe('file_created_after', () => {
    it('passes when mtime > since', async () => {
      const env = makeEnv();
      const f = path.join(env.outputsDir, 'fresh.md');
      fs.writeFileSync(f, 'x');
      const since = Date.now() - 60_000;
      const result = await checkCriterion({ type: 'file_created_after', path: 'fresh.md', since }, env);
      expect(result.passed).to.equal(true);
    });

    it('fails when mtime <= since', async () => {
      const env = makeEnv();
      const f = path.join(env.outputsDir, 'old.md');
      fs.writeFileSync(f, 'x');
      const since = Date.now() + 60_000;
      const result = await checkCriterion({ type: 'file_created_after', path: 'old.md', since }, env);
      expect(result.passed).to.equal(false);
    });
  });

  describe('memory_node_tagged', () => {
    it('passes when any node has the tag (case-insensitive)', async () => {
      const env = makeEnv({ nodes: [mkNode(1, 'x', 'Resolved:Dashboard')] });
      const result = await checkCriterion({ type: 'memory_node_tagged', tag: 'resolved:dashboard' }, env);
      expect(result.passed).to.equal(true);
    });

    it('fails when no node has the tag', async () => {
      const env = makeEnv({ nodes: [mkNode(1, 'x', 'other')] });
      const result = await checkCriterion({ type: 'memory_node_tagged', tag: 'resolved:dashboard' }, env);
      expect(result.passed).to.equal(false);
    });
  });

  describe('memory_node_matches', () => {
    it('passes when a node concept matches regex', async () => {
      const env = makeEnv({ nodes: [mkNode(1, 'Ion channel comparative study', 't')] });
      const result = await checkCriterion({ type: 'memory_node_matches', regex: 'ion channel.*comparative' }, env);
      expect(result.passed).to.equal(true);
    });

    it('fails when no node concept matches regex', async () => {
      const env = makeEnv({ nodes: [mkNode(1, 'unrelated', 't')] });
      const result = await checkCriterion({ type: 'memory_node_matches', regex: 'ion channel' }, env);
      expect(result.passed).to.equal(false);
    });
  });

  describe('output_count_since', () => {
    it('passes when enough files have mtime > since', async () => {
      const env = makeEnv();
      fs.writeFileSync(path.join(env.outputsDir, 'a.md'), 'x');
      fs.writeFileSync(path.join(env.outputsDir, 'b.md'), 'x');
      const since = Date.now() - 60_000;
      const result = await checkCriterion(
        { type: 'output_count_since', dir: '.', since, gte: 2 }, env);
      expect(result.passed).to.equal(true);
    });

    it('fails when not enough recent files', async () => {
      const env = makeEnv();
      fs.writeFileSync(path.join(env.outputsDir, 'a.md'), 'x');
      const since = Date.now() - 60_000;
      const result = await checkCriterion(
        { type: 'output_count_since', dir: '.', since, gte: 3 }, env);
      expect(result.passed).to.equal(false);
    });
  });

  describe('unknown type', () => {
    it('returns passed=false with a note', async () => {
      const env = makeEnv();
      const result = await checkCriterion({ type: 'not_a_real_type' }, env);
      expect(result.passed).to.equal(false);
      expect(result.note).to.match(/unknown/i);
    });
  });
});

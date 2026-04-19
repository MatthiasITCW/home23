#!/usr/bin/env node
/**
 * One-shot relocator for pre-Patch-7 research runs.
 *
 * Walks cosmo23/runs/, finds regular directories (not symlinks), asks
 * which agent owns each, moves to instances/<agent>/workspace/research-
 * runs/<runName>, symlinks back, writes run.json. Skippable per-run.
 */

const fs = require('node:fs/promises');
const path = require('node:path');
const readline = require('node:readline');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const COSMO_RUNS = path.join(REPO_ROOT, 'cosmo23', 'runs');
const INSTANCES = path.join(REPO_ROOT, 'instances');

function prompt(rl, question) {
  return new Promise(resolve => rl.question(question, a => resolve(a.trim())));
}

async function listAgents() {
  try {
    const entries = await fs.readdir(INSTANCES, { withFileTypes: true });
    return entries.filter(e => e.isDirectory()).map(e => e.name);
  } catch {
    return [];
  }
}

async function isRegularDir(p) {
  try {
    const s = await fs.lstat(p);
    return s.isDirectory() && !s.isSymbolicLink();
  } catch {
    return false;
  }
}

async function moveRun(sourcePath, destPath) {
  await fs.mkdir(path.dirname(destPath), { recursive: true });
  await fs.rename(sourcePath, destPath);
}

async function createSymlink(linkPath, targetPath) {
  try { await fs.unlink(linkPath); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  await fs.symlink(targetPath, linkPath, 'dir');
}

async function writeRunJson(runPath, owner, topic) {
  const file = path.join(runPath, 'run.json');
  try { await fs.access(file); return; } catch {}
  await fs.writeFile(file, JSON.stringify({
    owner,
    createdAt: new Date().toISOString(),
    topic: topic || null,
    runName: path.basename(runPath),
    relocatedAt: new Date().toISOString(),
  }, null, 2));
}

async function readTopic(runPath) {
  try {
    const meta = JSON.parse(await fs.readFile(path.join(runPath, 'metadata.json'), 'utf8'));
    return meta.topic || null;
  } catch { return null; }
}

async function main() {
  console.log(`Relocating runs from ${COSMO_RUNS} into instances/<agent>/workspace/research-runs/`);

  const agents = await listAgents();
  if (agents.length === 0) {
    console.error('No agents found under instances/. Abort.');
    process.exit(1);
  }
  console.log(`Detected agents: ${agents.join(', ')}`);

  let runs;
  try {
    runs = await fs.readdir(COSMO_RUNS);
  } catch (err) {
    console.error(`Cannot read ${COSMO_RUNS}: ${err.message}`);
    process.exit(1);
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  let moved = 0, skipped = 0;

  for (const runName of runs) {
    const sourcePath = path.join(COSMO_RUNS, runName);
    if (!await isRegularDir(sourcePath)) continue;

    const topic = await readTopic(sourcePath);
    console.log(`\n── Run: ${runName}${topic ? ` (topic: ${topic})` : ''}`);
    const ans = await prompt(rl, `Owner agent (one of ${agents.join('/')}) or 'skip' [skip]: `);
    if (!ans || ans.toLowerCase() === 'skip') { skipped++; continue; }
    if (!agents.includes(ans)) {
      console.log(`  ! '${ans}' is not a known agent. Skipped.`);
      skipped++;
      continue;
    }

    const destPath = path.join(INSTANCES, ans, 'workspace', 'research-runs', runName);
    try {
      await moveRun(sourcePath, destPath);
      await createSymlink(sourcePath, destPath);
      await writeRunJson(destPath, ans, topic);
      console.log(`  ✓ Moved to ${destPath}`);
      console.log(`  ✓ Symlink at ${sourcePath}`);
      moved++;
    } catch (err) {
      console.error(`  ✗ Failed: ${err.message}`);
      skipped++;
    }
  }

  rl.close();
  console.log(`\nDone. Moved: ${moved}. Skipped: ${skipped}.`);
}

main().catch(err => { console.error(err); process.exit(1); });

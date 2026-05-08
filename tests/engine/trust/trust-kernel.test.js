import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { TrustKernel } = require('../../../engine/src/trust/trust-kernel.js');

function tempKernel() {
  const dir = mkdtempSync(join(tmpdir(), 'home23-trust-kernel-'));
  const storePath = join(dir, 'trust', 'claims.jsonl');
  return { dir, storePath, kernel: new TrustKernel({ storePath }) };
}

function passReceipt(subject = 'from-the-inside/099') {
  return {
    receiptVersion: 'evidence.v1',
    receiptId: `ev_${subject.replace(/[^a-z0-9]+/gi, '_')}`,
    actor: 'jerry',
    action: 'verify_claim',
    subject,
    checks: [{ name: 'verified', pass: true }],
    result: 'pass',
    claimLevel: 'verified_claim',
    createdAt: '2026-05-08T12:00:00.000Z',
  };
}

test('TrustKernel blocks consequential claims that lack verified receipts', () => {
  const { dir, kernel } = tempKernel();
  try {
    kernel.recordClaim({
      id: 'good_life.open_problems.zero',
      type: 'good_life.state',
      subject: 'good-life',
      predicate: 'open_problems',
      value: 0,
      actor: 'jerry',
      observedAt: '2026-05-08T12:00:00.000Z',
      scope: 'autonomous_action',
      privacyClass: 'operational_internal',
      status: 'candidate_claim',
      freshnessTTL: 5 * 60 * 1000,
    });

    const explanation = kernel.explain('good_life.open_problems.zero', {
      now: '2026-05-08T12:01:00.000Z',
    });

    assert.equal(explanation.status, 'candidate_claim');
    assert.equal(explanation.safeToInherit, false);
    assert.ok(explanation.reasons.includes('claim_not_verified'));
    assert.ok(explanation.reasons.includes('consequential_claim_requires_verified_receipt'));
    assert.equal(explanation.recommendedAction, 'run_or_attach_verifier_receipt');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('TrustKernel promotes receipt-backed consequential claims as safe to inherit', () => {
  const { dir, storePath, kernel } = tempKernel();
  try {
    const receipt = passReceipt();
    const receiptPath = join(dir, '099.evidence.json');
    writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);

    const claim = kernel.recordVerifiedClaim({
      claim: {
        id: 'from-the-inside.issue.099.published',
        type: 'issue.published',
        subject: 'from-the-inside/099',
        predicate: 'published',
        value: true,
        actor: 'jerry',
        observedAt: '2026-05-08T12:00:00.000Z',
        scope: 'public_artifact',
        privacyClass: 'public_artifact',
        verifier: 'verify-from-the-inside-publish',
      },
      receipt,
      receiptPath,
    });

    const explanation = kernel.explain(claim.id, { now: '2026-05-08T12:04:00.000Z' });

    assert.equal(explanation.status, 'known_verified');
    assert.equal(explanation.safeToInherit, true);
    assert.equal(explanation.claim.id, 'from-the-inside.issue.099.published');
    assert.equal(explanation.evidence[0].receiptId, receipt.receiptId);
    assert.equal(explanation.evidence[0].verified, true);
    assert.equal(explanation.conflicts.length, 0);
    assert.ok(existsSync(storePath));
    const events = readFileSync(storePath, 'utf8').trim().split('\n').map(JSON.parse);
    assert.equal(events[0].eventType, 'claim.verified');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('TrustKernel marks verified claims stale after their freshness TTL expires', () => {
  const { dir, kernel } = tempKernel();
  try {
    kernel.recordVerifiedClaim({
      claim: {
        id: 'good_life.open_problems.zero',
        type: 'good_life.state',
        subject: 'good-life',
        predicate: 'open_problems',
        value: 0,
        actor: 'jerry',
        observedAt: '2026-05-08T12:00:00.000Z',
        scope: 'user_facing_status',
        privacyClass: 'operational_internal',
        freshnessTTL: 5 * 60 * 1000,
        verifier: 'good-life-live-problems-projection',
      },
      receipt: passReceipt('good-life/open-problems'),
      receiptPath: join(dir, 'good-life.evidence.json'),
    });

    const explanation = kernel.explain('good_life.open_problems.zero', {
      now: '2026-05-08T12:06:00.000Z',
    });

    assert.equal(explanation.status, 'known_stale');
    assert.equal(explanation.safeToInherit, false);
    assert.ok(explanation.reasons.includes('freshness_ttl_expired'));
    assert.equal(explanation.recommendedAction, 'refresh_claim_verification');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('TrustKernel records failed receipts as unverified claims', () => {
  const { dir, storePath, kernel } = tempKernel();
  try {
    const receipt = {
      ...passReceipt('from-the-inside/099'),
      result: 'fail',
      claimLevel: 'candidate_claim',
    };
    kernel.recordVerifiedClaim({
      claim: {
        id: 'from-the-inside.issue.099.published',
        type: 'issue.published',
        subject: 'from-the-inside/099',
        predicate: 'published',
        value: true,
        actor: 'jerry',
        observedAt: '2026-05-08T12:00:00.000Z',
        scope: 'public_artifact',
        privacyClass: 'public_artifact',
        verifier: 'verify-from-the-inside-publish',
      },
      receipt,
      receiptPath: join(dir, '099.evidence.json'),
    });

    const explanation = kernel.explain('from-the-inside.issue.099.published', {
      now: '2026-05-08T12:01:00.000Z',
    });
    const events = readFileSync(storePath, 'utf8').trim().split('\n').map(JSON.parse);

    assert.equal(events[0].eventType, 'claim.verification_failed');
    assert.equal(explanation.status, 'known_unverified');
    assert.equal(explanation.safeToInherit, false);
    assert.ok(explanation.reasons.includes('consequential_claim_requires_verified_receipt'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('TrustKernel surfaces verified claim conflicts instead of choosing a silent winner', () => {
  const { dir, kernel } = tempKernel();
  try {
    const base = {
      type: 'good_life.state',
      subject: 'good-life',
      predicate: 'open_problems',
      actor: 'jerry',
      observedAt: '2026-05-08T12:00:00.000Z',
      scope: 'autonomous_action',
      privacyClass: 'operational_internal',
      freshnessTTL: 10 * 60 * 1000,
      verifier: 'projection-check',
    };
    kernel.recordVerifiedClaim({
      claim: { ...base, id: 'good_life.open_problems.zero', value: 0 },
      receipt: passReceipt('good-life/open-problems-zero'),
      receiptPath: join(dir, 'zero.evidence.json'),
    });
    kernel.recordVerifiedClaim({
      claim: { ...base, id: 'good_life.open_problems.one', value: 1 },
      receipt: passReceipt('good-life/open-problems-one'),
      receiptPath: join(dir, 'one.evidence.json'),
    });

    const explanation = kernel.explain('good_life.open_problems.zero', {
      now: '2026-05-08T12:02:00.000Z',
    });

    assert.equal(explanation.status, 'known_conflicted');
    assert.equal(explanation.safeToInherit, false);
    assert.ok(explanation.reasons.includes('claim_conflict_detected'));
    assert.equal(explanation.conflicts.length, 1);
    assert.equal(explanation.conflicts[0].claimId, 'good_life.open_problems.one');
    assert.equal(explanation.recommendedAction, 'write_reconciliation_receipt');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

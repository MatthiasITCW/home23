const assert = require('node:assert/strict');
const fs = require('node:fs');
const { mkdtempSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { BACKUP_FILES, maybeBackup } = require('../../../engine/src/core/brain-backups');

test('maybeBackup creates coherent snapshots without synchronous copy calls', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'brain-backup-async-'));
  for (const file of BACKUP_FILES) {
    writeFileSync(path.join(dir, file), `${file}\n`);
  }

  const originalCopyFileSync = fs.copyFileSync;
  fs.copyFileSync = () => {
    throw new Error('sync copy should not be used for brain backups');
  };

  try {
    const result = await maybeBackup(dir, { force: true, retention: 2 });
    assert.equal(result.created, true);
    const backupPath = path.join(dir, 'backups', result.backupName);
    assert.equal(fs.existsSync(backupPath), true);
    for (const file of BACKUP_FILES) {
      assert.equal(fs.existsSync(path.join(backupPath, file)), true);
    }
  } finally {
    fs.copyFileSync = originalCopyFileSync;
  }
});

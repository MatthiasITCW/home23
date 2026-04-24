const fs = require('fs');
const path = require('path');

function countYamlCommentLines(raw) {
  return String(raw || '')
    .split(/\r?\n/)
    .filter((line) => /^\s*#/.test(line))
    .length;
}

function makeBackupPath(filePath, options = {}) {
  const rootDir = path.resolve(options.rootDir || process.cwd());
  const backupRoot = path.resolve(options.backupRoot || path.join(rootDir, 'engine', '.backups', 'yaml-write-safety'));
  const relative = path.relative(rootDir, path.resolve(filePath));
  const safeRelative = relative && !relative.startsWith('..') && !path.isAbsolute(relative)
    ? relative
    : path.basename(filePath);
  const stamp = (options.now || new Date()).toISOString().replace(/[:.]/g, '-');
  return path.join(backupRoot, stamp, safeRelative);
}

function writeYamlSafely(filePath, data, options = {}) {
  const yaml = options.yaml;
  if (!yaml || typeof yaml.dump !== 'function') {
    throw new Error('writeYamlSafely requires a yaml implementation with dump()');
  }

  const lineWidth = options.lineWidth ?? 120;
  let commentLines = 0;
  let backupPath = null;

  if (fs.existsSync(filePath)) {
    const previous = fs.readFileSync(filePath, 'utf8');
    commentLines = countYamlCommentLines(previous);
    if (commentLines > 0) {
      backupPath = makeBackupPath(filePath, options);
      fs.mkdirSync(path.dirname(backupPath), { recursive: true });
      fs.writeFileSync(backupPath, previous, 'utf8');
      options.logger?.warn?.('[yaml-write-safety] preserving pre-write YAML snapshot before js-yaml rewrite', {
        filePath,
        backupPath,
        commentLines,
      });
    }
  }

  fs.writeFileSync(filePath, yaml.dump(data, { lineWidth }), 'utf8');
  return {
    commentsDetected: commentLines > 0,
    commentLines,
    backupPath,
  };
}

module.exports = {
  countYamlCommentLines,
  makeBackupPath,
  writeYamlSafely,
};

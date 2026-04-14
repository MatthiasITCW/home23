/**
 * Action: ack_notification
 * Marks a notification as acknowledged by the agent itself (self-management).
 * Rewrites notifications.jsonl in place, flipping `acknowledged` to true and
 * stamping who acked (the role) + when.
 */

const fs = require('fs');
const path = require('path');

async function run({ action, target, brainDir, role, logger }) {
  const id = target || action.id;
  if (!id) {
    return { status: 'rejected', detail: 'target (notification id) required' };
  }
  const file = path.join(brainDir, 'notifications.jsonl');
  if (!fs.existsSync(file)) {
    return { status: 'rejected', detail: 'notifications.jsonl does not exist' };
  }

  let found = false;
  const lines = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean);
  const rewritten = lines.map(line => {
    try {
      const n = JSON.parse(line);
      if (n.id === id) {
        found = true;
        return JSON.stringify({
          ...n,
          acknowledged: true,
          acknowledged_by: `agent:${role}`,
          acknowledged_at: new Date().toISOString(),
        });
      }
      return line;
    } catch {
      return line;
    }
  });

  if (!found) {
    return { status: 'rejected', detail: `notification id '${id}' not found` };
  }

  try {
    fs.writeFileSync(file, rewritten.join('\n') + '\n');
  } catch (err) {
    return { status: 'rejected', detail: `write failed: ${err.message}` };
  }

  return {
    status: 'success',
    detail: `acked notification ${id}`,
    memoryDelta: { acked: [id] },
  };
}

module.exports = { run };

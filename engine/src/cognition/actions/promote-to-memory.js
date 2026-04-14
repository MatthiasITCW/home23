/**
 * Action: promote_to_memory
 * Creates a durable memory node from an insight the cycle wants to preserve.
 * Writes via memory.addNode() if available. Tag defaults to 'agent_promoted'
 * unless action.tag is specified.
 */

async function run({ action, memory, cycle, role, logger }) {
  const content = action.content || action.body || action.insight;
  if (!content || typeof content !== 'string' || content.trim().length < 10) {
    return { status: 'rejected', detail: 'action.content required (min 10 chars)' };
  }
  if (!memory || typeof memory.addNode !== 'function') {
    return { status: 'rejected', detail: 'memory.addNode not available' };
  }

  const tag = action.tag || 'agent_promoted';
  try {
    const node = await memory.addNode(content.trim(), tag);
    return {
      status: 'success',
      detail: `promoted (tag=${tag})`,
      memoryDelta: { added_node: node?.id || true, tag },
    };
  } catch (err) {
    return { status: 'rejected', detail: `addNode failed: ${err.message}` };
  }
}

module.exports = { run };

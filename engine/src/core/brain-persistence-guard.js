const { readSnapshot } = require('./brain-snapshot');
const { readJsonlGz, nodesPath, sidecarsExist } = require('./memory-sidecar');
const { StateCompression } = require('./state-compression');

async function countSidecarNodes(brainDir) {
  let count = 0;
  await readJsonlGz(nodesPath(brainDir), () => {
    count += 1;
  });
  return count;
}

async function resolveKnownGoodNodeCount(brainDir, statePath, options = {}) {
  const snapshotReader = options.readSnapshot || readSnapshot;
  const stateLoader = options.loadCompressed || StateCompression.loadCompressed;
  const sidecarCounter = options.countSidecarNodes || countSidecarNodes;
  const sidecarExists = options.sidecarsExist || sidecarsExist;

  const sidecar = snapshotReader(brainDir);
  if (Number.isFinite(sidecar?.nodeCount)) {
    return { count: sidecar.nodeCount, source: 'snapshot' };
  }

  if (sidecarExists(brainDir)) {
    const sidecarCount = await sidecarCounter(brainDir);
    if (Number.isFinite(sidecarCount) && sidecarCount > 0) {
      return { count: sidecarCount, source: 'memory-sidecar' };
    }
  }

  const existingState = await stateLoader(statePath);
  const inlineCount = existingState?.memory?.nodes?.length || 0;
  return { count: inlineCount, source: 'state-file', state: existingState };
}

function evaluateSaveSafety({ currentNodes, existingNodes, source, cycle, dropFloor = 0.5 }) {
  if (existingNodes > 100 && currentNodes < existingNodes * dropFloor) {
    return {
      ok: false,
      reason: 'catastrophic_node_loss',
      currentNodes,
      existingNodes,
      source,
      cycle,
      dropPercent: Number(((1 - currentNodes / existingNodes) * 100).toFixed(1)),
    };
  }

  return {
    ok: true,
    currentNodes,
    existingNodes,
    source,
    cycle,
  };
}

module.exports = {
  countSidecarNodes,
  resolveKnownGoodNodeCount,
  evaluateSaveSafety,
};

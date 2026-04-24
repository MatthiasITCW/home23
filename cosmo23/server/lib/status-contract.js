function hasProcess(processStatus, name) {
  return Array.isArray(processStatus?.running)
    && processStatus.running.some((process) => process?.name === name);
}

function buildStatusContract({
  activeContext = null,
  processStatus = { running: [], count: 0 },
  isLaunching = false,
  ports = {},
  now = new Date(),
  uptimeMs = Math.round(process.uptime() * 1000),
} = {}) {
  const cosmoMainOnline = hasProcess(processStatus, 'cosmo-main');
  const hasActiveContext = !!activeContext;
  const activeRun = hasActiveContext && cosmoMainOnline;

  let lifecycle = 'idle';
  if (isLaunching) lifecycle = 'launching';
  else if (activeRun) lifecycle = 'running';
  else if (hasActiveContext) lifecycle = 'context_without_process';
  else if (cosmoMainOnline) lifecycle = 'process_without_context';

  return {
    apiReachable: true,
    lifecycle,
    activeRun,
    processOnline: cosmoMainOnline,
    hasActiveContext,
    isLaunching,
    lastHeartbeat: null,
    generatedAt: now instanceof Date ? now.toISOString() : String(now),
    uptimeMs,
    process: {
      cosmoMainOnline,
      count: processStatus?.count || 0,
      runningNames: Array.isArray(processStatus?.running)
        ? processStatus.running.map((process) => process?.name).filter(Boolean)
        : [],
    },
    run: activeContext ? {
      runName: activeContext.runName || null,
      brainId: activeContext.brainId || null,
      topic: activeContext.topic || null,
      startedAt: activeContext.startedAt || null,
      runPath: activeContext.runPath || null,
    } : null,
    ports,
  };
}

module.exports = { buildStatusContract };

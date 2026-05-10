class ArtifactLifecycle {
  constructor(options = {}) {
    this.registry = options.registry;
    this.memory = options.memory || null;
    this.logger = options.logger || null;
  }

  async markConsumed(artifactId, consumer = {}) {
    const record = await this.registry.markReused(artifactId, consumer);
    if (!record) return null;
    if (this.memory && typeof this.memory.addNode === 'function') {
      try {
        const node = await this.memory.addNode({
          concept: `Artifact reused: ${record.id}${consumer.reason ? `\nReason: ${consumer.reason}` : ''}`,
          tag: 'artifact_reuse',
          type: 'artifact_reuse',
          metadata: {
            artifactId: record.id,
            consumerAgentId: consumer.agentId || null,
            consumerTaskId: consumer.taskId || null,
            consumerGoalId: consumer.goalId || consumer.missionGoal || null
          }
        });
        if (node?.id && record.memoryMirrorNodeId && typeof this.memory.addEdge === 'function') {
          this.memory.addEdge(record.memoryMirrorNodeId, node.id, 0.5, 'artifact_reused_by');
        }
      } catch (error) {
        this.logger?.warn?.('[artifact-lifecycle] reuse memory write failed', { error: error.message });
      }
    }
    return record;
  }

  async commit(artifactId, metadata = {}) {
    return this.registry.promote(artifactId, 'committed', metadata);
  }

  async linkSupports(sourceArtifactId, targetArtifactId, metadata = {}) {
    const source = this.registry.get(sourceArtifactId);
    const target = this.registry.get(targetArtifactId);
    if (!source || !target) return null;
    source.supports = this.registry.unique([...(source.supports || []), targetArtifactId]);
    source.metadata = { ...(source.metadata || {}), supportMetadata: metadata };
    source.updatedAt = new Date().toISOString();
    this.registry.records.set(source.id, source);
    await this.registry.save();
    if (this.memory && source.memoryMirrorNodeId && target.memoryMirrorNodeId && typeof this.memory.addEdge === 'function') {
      this.memory.addEdge(source.memoryMirrorNodeId, target.memoryMirrorNodeId, 0.65, 'artifact_supports');
    }
    return source;
  }
}

module.exports = { ArtifactLifecycle };

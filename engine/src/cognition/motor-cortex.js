'use strict';

/**
 * MotorCortex turns critic-kept agenda records into bounded engine actions.
 *
 * This is intentionally not a raw shell/file layer. It routes through the
 * orchestrator's named agenda executor, which already fans into ACT or the
 * live-problems diagnostic path. The point is continuity: think -> agenda ->
 * act -> audit, without giving background cognition ungated hands.
 */
class MotorCortex {
  constructor(opts = {}) {
    this.executeAgendaItem = typeof opts.executeAgendaItem === 'function' ? opts.executeAgendaItem : null;
    this.canAct = typeof opts.canAct === 'function' ? opts.canAct : (() => true);
    this.agendaStore = opts.agendaStore || null;
    this.logger = opts.logger || console;
    this.enabled = opts.enabled !== false;
  }

  async actOnAgendaItem(item, context = {}) {
    const agendaId = item?.id || null;
    const content = String(item?.content || '').trim();
    const actor = context.actor || 'motor-cortex';

    if (!this.enabled) {
      return this._result('skipped', agendaId, 'motor cortex disabled');
    }
    if (!agendaId || !content) {
      return this._result('rejected', agendaId, 'agenda item with id and content required');
    }
    if (!this.executeAgendaItem) {
      return this._result('rejected', agendaId, 'no bounded agenda executor configured');
    }
    if (!this.canAct(item, context)) {
      return this._result('rejected', agendaId, 'agenda item failed motor policy');
    }

    try {
      const action = await this.executeAgendaItem(item, {
        ...context,
        actor,
        origin: 'thinking-machine',
      });
      const acted = Boolean(action?.directAction || action?.problemId || action?.action);
      if (acted && this.agendaStore?.updateStatus) {
        this.agendaStore.updateStatus(agendaId, 'acted_on', {
          actor,
          note: action.detail || action.status || action.action || 'motor action routed',
        });
      }
      this.logger.info?.('[motor-cortex] agenda action routed', {
        agendaId,
        action: action?.action || null,
        target: action?.target || action?.problemId || null,
        status: action?.status || null,
      });
      return {
        status: acted ? 'acted' : 'no_action',
        agendaId,
        action: action || null,
      };
    } catch (error) {
      this.logger.warn?.('[motor-cortex] agenda action failed', {
        agendaId,
        error: error?.message || String(error),
      });
      return this._result('failed', agendaId, error?.message || String(error));
    }
  }

  _result(status, agendaId, detail) {
    return { status, agendaId, detail };
  }
}

module.exports = { MotorCortex };

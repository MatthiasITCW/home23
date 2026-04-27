import type { Request, Response } from 'express';
import type { AgentLoop } from '../agent/loop.js';
import type { ConversationHistory } from '../agent/history.js';
import type { MediaAttachment } from '../types.js';
import { TurnStore } from '../chat/turn-store.js';
import { turnBus } from '../chat/turn-bus.js';
import { isTurnEnvelope, isTurnEvent } from '../chat/turn-types.js';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, extname } from 'node:path';
import { randomUUID } from 'node:crypto';

export interface ChatTurnConfig {
  agentName: string;
  agent: AgentLoop;
  history: ConversationHistory;
  token?: string;
  modelAliases?: Record<string, { provider: string; model: string }>;
  /** Absolute path to instances/<agent>/. Used as upload root for chat image attachments. */
  instanceDir?: string;
}

function checkAuth(req: Request, res: Response, token?: string): boolean {
  if (!token) return true;
  const h = req.headers.authorization;
  if (!h || h !== `Bearer ${token}`) {
    res.status(401).json({ error: 'Unauthorized' });
    return false;
  }
  return true;
}

/** POST /api/chat/turn — start a turn, return turn_id immediately. Agent runs detached. */
export function createTurnStartHandler(config: ChatTurnConfig) {
  return async (req: Request, res: Response): Promise<void> => {
    if (!checkAuth(req, res, config.token)) return;

    const { chatId, message, model, images } = req.body ?? {};
    if (!chatId || typeof chatId !== 'string') {
      res.status(400).json({ error: 'chatId required' }); return;
    }
    if (!message || typeof message !== 'string') {
      res.status(400).json({ error: 'message required' }); return;
    }

    const ALLOWED_MIME = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
    const MAX_IMAGES = 6;
    const MAX_BYTES = 10 * 1024 * 1024;
    const validatedImages: Array<{ buf: Buffer; mimeType: string; fileName?: string }> = [];
    if (images !== undefined) {
      if (!Array.isArray(images)) {
        res.status(400).json({ error: 'images must be an array' }); return;
      }
      if (images.length > MAX_IMAGES) {
        res.status(413).json({ error: `too many images (max ${MAX_IMAGES})` }); return;
      }
      for (const img of images) {
        if (!img || typeof img.data !== 'string' || typeof img.mimeType !== 'string') {
          res.status(400).json({ error: 'each image needs data (base64) and mimeType' }); return;
        }
        if (!ALLOWED_MIME.has(img.mimeType)) {
          res.status(415).json({ error: `unsupported mime ${img.mimeType}` }); return;
        }
        let buf: Buffer;
        try { buf = Buffer.from(img.data, 'base64'); }
        catch { res.status(400).json({ error: 'invalid base64' }); return; }
        if (buf.length === 0) {
          res.status(400).json({ error: 'empty image' }); return;
        }
        if (buf.length > MAX_BYTES) {
          res.status(413).json({ error: `image exceeds ${MAX_BYTES} bytes` }); return;
        }
        validatedImages.push({ buf, mimeType: img.mimeType, fileName: typeof img.fileName === 'string' ? img.fileName : undefined });
      }
    }

    // Reject concurrent runs for same chatId — surface the already-running turn
    if (config.agent.isRunning(chatId)) {
      const store = new TurnStore(config.history);
      const pending = store.pendingTurns(chatId);
      const existing = pending[pending.length - 1];
      if (existing) {
        res.status(409).json({ error: 'turn in progress', turn_id: existing.turn_id });
        return;
      }
    }

    // Resolve model alias → { model, provider } for per-turn override.
    let modelOverride: { model: string; provider?: string } | undefined;
    if (typeof model === 'string' && model.length > 0) {
      const alias = config.modelAliases?.[model];
      if (alias) {
        modelOverride = { model: alias.model, provider: alias.provider };
      } else {
        // Accept raw model name without alias — provider inferred by setModel().
        modelOverride = { model };
      }
    }

    // Generate turnId early so image filenames can use it.
    const turnId = `t_${Date.now()}_${randomUUID().slice(0, 8)}`;

    const media: MediaAttachment[] = [];
    if (validatedImages.length > 0) {
      if (!config.instanceDir) {
        res.status(500).json({ error: 'instanceDir not configured' }); return;
      }
      const uploadDir = join(config.instanceDir, 'uploads', 'chat');
      mkdirSync(uploadDir, { recursive: true });
      const extByMime: Record<string, string> = {
        'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp', 'image/gif': '.gif',
      };
      for (let i = 0; i < validatedImages.length; i++) {
        const v = validatedImages[i]!;
        const ext = extByMime[v.mimeType] ?? extname(v.fileName ?? '') ?? '.bin';
        const p = join(uploadDir, `${turnId}-${i}${ext}`);
        writeFileSync(p, v.buf);
        media.push({ type: 'image', path: p, mimeType: v.mimeType, fileName: v.fileName });
      }
    }

    try {
      const { turnId: actualTurnId, response } = await config.agent.runWithTurn(chatId, message, {
        turnId,
        modelOverride,
        media: media.length > 0 ? media : undefined,
      });

      // Detach — don't await. Swallow errors (already persisted to JSONL as error envelope).
      response.catch(err => {
        console.error(`[chat-turn] ${config.agentName} ${actualTurnId} error:`, err?.message || err);
      });

      res.json({ turn_id: actualTurnId });
    } catch (err) {
      const m = err instanceof Error ? err.message : String(err);
      console.error(`[chat-turn] ${config.agentName} start error:`, m);
      res.status(500).json({ error: m });
    }
  };
}

/** GET /api/chat/stream?chatId=X&turn_id=Y&cursor=N — SSE replay + live tail. */
export function createTurnStreamHandler(config: ChatTurnConfig) {
  return async (req: Request, res: Response): Promise<void> => {
    if (!checkAuth(req, res, config.token)) return;

    const chatId = String(req.query.chatId || '');
    const turnId = String(req.query.turn_id || '');
    const cursor = Number(req.query.cursor ?? -1);

    if (!chatId || !turnId) {
      res.status(400).json({ error: 'chatId and turn_id required' });
      return;
    }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    const write = (data: unknown): void => {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    const store = new TurnStore(config.history);

    // Phase 1: catch-up from JSONL
    const catchup = store.eventsSince(chatId, turnId, cursor);
    let lastSeq = cursor;
    for (const ev of catchup) {
      write(ev);
      lastSeq = ev.seq;
    }

    // Check if turn already finished before we subscribe
    const finalEnv = store.finalEnvelope(chatId, turnId);
    if (finalEnv) {
      write(finalEnv);
      res.write('data: [DONE]\n\n');
      res.end();
      return;
    }

    // Phase 2: subscribe for live events (dedup against what we just replayed)
    let finished = false;
    const unsubscribe = turnBus.subscribe(chatId, turnId, (record) => {
      if (finished) return;
      if (isTurnEvent(record) && record.seq <= lastSeq) return; // already sent during catch-up
      write(record);
      if (isTurnEvent(record)) lastSeq = record.seq;
      if (isTurnEnvelope(record) && record.status !== 'pending') {
        finished = true;
        res.write('data: [DONE]\n\n');
        res.end();
      }
    });

    // Client disconnect
    req.on('close', () => {
      finished = true;
      unsubscribe();
    });

    // Heartbeat to keep connection alive through proxies (every 15s)
    const heartbeat = setInterval(() => {
      if (finished) { clearInterval(heartbeat); return; }
      res.write(': heartbeat\n\n');
    }, 15000);

    res.on('close', () => clearInterval(heartbeat));
  };
}

/** POST /api/chat/stop-turn {chatId, turn_id} — stop the active run. */
export function createTurnStopHandler(config: ChatTurnConfig) {
  return (req: Request, res: Response): void => {
    if (!checkAuth(req, res, config.token)) return;

    const chatId = req.body?.chatId;
    if (!chatId) { res.status(400).json({ error: 'chatId required' }); return; }

    const result = config.agent.stop(chatId);
    res.json(result);
  };
}

/** GET /api/chat/models — list of alias names the client can pick from, plus current default. */
export function createModelsHandler(config: ChatTurnConfig) {
  return (req: Request, res: Response): void => {
    if (!checkAuth(req, res, config.token)) return;
    const aliases = config.modelAliases ?? {};
    const models = Object.entries(aliases).map(([alias, val]) => ({
      alias,
      provider: val.provider,
      model: val.model,
    }));
    res.json({
      models,
      defaultModel: config.agent.getModel(),
      defaultProvider: config.agent.getProvider(),
    });
  };
}

/** GET /api/chat/pending?chatId=X — list pending turns (for page-load resume). Sweeps orphans >10min. */
export function createPendingTurnsHandler(config: ChatTurnConfig) {
  return (req: Request, res: Response): void => {
    if (!checkAuth(req, res, config.token)) return;

    const chatId = String(req.query.chatId || '');
    if (!chatId) { res.status(400).json({ error: 'chatId required' }); return; }

    const store = new TurnStore(config.history);
    // Sweep orphans older than 10 minutes for this chatId before listing
    store.sweepOrphans(chatId, 10 * 60 * 1000);
    res.json({ pending: store.pendingTurns(chatId) });
  };
}

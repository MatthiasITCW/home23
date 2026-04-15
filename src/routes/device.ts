import type { Request, Response } from 'express';
import type { DeviceRegistry } from '../push/device-registry.js';

export interface DeviceRouteConfig {
  agentName: string;
  registry: DeviceRegistry;
  token?: string;
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

/** POST /api/device/register — register a device for push notifications. */
export function createRegisterDeviceHandler(config: DeviceRouteConfig) {
  return (req: Request, res: Response): void => {
    if (!checkAuth(req, res, config.token)) return;

    const { device_token, chat_ids, bundle_id, env } = req.body ?? {};

    if (!device_token || typeof device_token !== 'string' || !/^[0-9a-fA-F]{32,}$/.test(device_token)) {
      res.status(400).json({ error: 'valid device_token (hex) required' }); return;
    }
    if (!Array.isArray(chat_ids) || !chat_ids.every(c => typeof c === 'string')) {
      res.status(400).json({ error: 'chat_ids: string[] required' }); return;
    }
    if (!bundle_id || typeof bundle_id !== 'string') {
      res.status(400).json({ error: 'bundle_id required' }); return;
    }
    if (env !== 'sandbox' && env !== 'production') {
      res.status(400).json({ error: 'env must be sandbox or production' }); return;
    }

    const result = config.registry.register({ device_token, chat_ids, bundle_id, env });
    res.json({ registered: true, device: result });
  };
}

/** DELETE /api/device/register — unregister a device entirely. */
export function createUnregisterDeviceHandler(config: DeviceRouteConfig) {
  return (req: Request, res: Response): void => {
    if (!checkAuth(req, res, config.token)) return;

    const { device_token, bundle_id } = req.body ?? {};
    if (!device_token || !bundle_id) {
      res.status(400).json({ error: 'device_token and bundle_id required' }); return;
    }
    const removed = config.registry.unregister(device_token, bundle_id);
    res.json({ unregistered: removed });
  };
}

/** GET /api/device/registry — diagnostic, returns the full list. */
export function createListDevicesHandler(config: DeviceRouteConfig) {
  return (_req: Request, res: Response): void => {
    res.json({ devices: config.registry.list() });
  };
}

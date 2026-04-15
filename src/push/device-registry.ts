import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { DeviceRegistration, DeviceRegistryFile } from './types.js';

/**
 * Per-agent device registry backed by a single JSON file.
 * Safe for single-process access (harness is one process per agent).
 */
export class DeviceRegistry {
  constructor(private filePath: string) {}

  private load(): DeviceRegistryFile {
    if (!existsSync(this.filePath)) return { version: 1, devices: [] };
    try {
      const raw = readFileSync(this.filePath, 'utf8');
      const parsed = JSON.parse(raw);
      if (parsed.version !== 1 || !Array.isArray(parsed.devices)) {
        return { version: 1, devices: [] };
      }
      return parsed;
    } catch {
      return { version: 1, devices: [] };
    }
  }

  private save(file: DeviceRegistryFile): void {
    mkdirSync(dirname(this.filePath), { recursive: true });
    writeFileSync(this.filePath, JSON.stringify(file, null, 2));
  }

  /** Register or update a device. Dedupes by (device_token, bundle_id). Adds any new chat_ids to the existing subscription. */
  register(input: {
    device_token: string;
    bundle_id: string;
    env: 'sandbox' | 'production';
    chat_ids: string[];
  }): DeviceRegistration {
    const file = this.load();
    const now = new Date().toISOString();
    const key = `${input.bundle_id}::${input.device_token}`;
    const idx = file.devices.findIndex(d => `${d.bundle_id}::${d.device_token}` === key);
    if (idx >= 0) {
      const existing = file.devices[idx]!;
      const mergedChats = Array.from(new Set([...existing.chat_ids, ...input.chat_ids]));
      const updated: DeviceRegistration = {
        ...existing,
        chat_ids: mergedChats,
        last_seen_at: now,
        env: input.env,
      };
      file.devices[idx] = updated;
      this.save(file);
      return updated;
    }
    const fresh: DeviceRegistration = {
      device_token: input.device_token,
      chat_ids: input.chat_ids,
      registered_at: now,
      last_seen_at: now,
      bundle_id: input.bundle_id,
      env: input.env,
    };
    file.devices.push(fresh);
    this.save(file);
    return fresh;
  }

  /** Remove a device entirely (all chat_id subscriptions). */
  unregister(deviceToken: string, bundleId: string): boolean {
    const file = this.load();
    const before = file.devices.length;
    file.devices = file.devices.filter(d => !(d.device_token === deviceToken && d.bundle_id === bundleId));
    if (file.devices.length !== before) {
      this.save(file);
      return true;
    }
    return false;
  }

  /** Devices subscribed to a chat_id. */
  lookupByChatId(chatId: string): DeviceRegistration[] {
    return this.load().devices.filter(d => d.chat_ids.includes(chatId));
  }

  /** Mark a device token invalid — remove it (APNs 410 Gone response). */
  invalidate(deviceToken: string, bundleId: string): void {
    this.unregister(deviceToken, bundleId);
  }

  list(): DeviceRegistration[] {
    return this.load().devices;
  }
}

import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import { loadWorker } from './registry.js';
import type { WorkerConfig } from './types.js';

export interface CreateWorkerOptions {
  name: string;
  template: string;
  ownerAgent?: string;
}

export interface CreateWorkerResult {
  worker: WorkerConfig;
  createdPath: string;
}

function assertWorkerName(name: string): string {
  if (!/^[a-z][a-z0-9-]{1,62}$/.test(name)) {
    throw new Error('Worker name must be lowercase kebab-case and 2-63 characters long');
  }
  return name;
}

export function createWorkerFromTemplate(projectRoot: string, opts: CreateWorkerOptions): CreateWorkerResult {
  const name = assertWorkerName(opts.name);
  const template = assertWorkerName(opts.template);
  const sourceDir = path.join(projectRoot, 'cli', 'templates', 'workers', template);
  const targetDir = path.join(projectRoot, 'instances', 'workers', name);
  const targetConfig = path.join(targetDir, 'worker.yaml');

  if (!existsSync(sourceDir)) throw new Error(`Worker template not found: ${template}`);
  if (existsSync(targetConfig)) throw new Error(`Worker already exists: ${name}`);

  mkdirSync(path.dirname(targetDir), { recursive: true });
  cpSync(sourceDir, targetDir, { recursive: true, errorOnExist: false });
  mkdirSync(path.join(targetDir, 'runs'), { recursive: true });
  mkdirSync(path.join(targetDir, 'logs'), { recursive: true });
  mkdirSync(path.join(targetDir, 'workspace', 'sessions'), { recursive: true });
  mkdirSync(path.join(targetDir, 'workspace', 'artifacts'), { recursive: true });

  const raw = yaml.load(readFileSync(targetConfig, 'utf8')) as Record<string, unknown>;
  raw.name = name;
  if (opts.ownerAgent) raw.ownerAgent = opts.ownerAgent;
  writeFileSync(targetConfig, yaml.dump(raw, { lineWidth: 120, noRefs: true }));

  return {
    worker: loadWorker(projectRoot, name),
    createdPath: targetDir
  };
}

/**
 * COSMO 2.3 Config Pre-Seeder
 *
 * Merges Home23's API keys into COSMO's config.json format.
 * Only touches provider credentials — COSMO's own config system
 * handles everything else (model selection, run settings, etc.).
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import yaml from 'js-yaml';

function loadYaml(filePath) {
  if (!existsSync(filePath)) return {};
  return yaml.load(readFileSync(filePath, 'utf8')) || {};
}

export function seedCosmo23Config(home23Root) {
  const secrets = loadYaml(join(home23Root, 'config', 'secrets.yaml'));
  const homeConfig = loadYaml(join(home23Root, 'config', 'home.yaml'));

  const configDir = join(home23Root, 'cosmo23', '.cosmo23-config');
  const configPath = join(configDir, 'config.json');

  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true });
  }

  // Read existing config if it exists (preserve user settings)
  let config = {};
  if (existsSync(configPath)) {
    try {
      config = JSON.parse(readFileSync(configPath, 'utf8'));
    } catch {
      config = {};
    }
  }

  // Ensure structure exists
  if (!config.providers) config.providers = {};
  if (!config.security) config.security = {};
  if (!config.server) config.server = {};
  if (!config.features) config.features = {};

  // Home23 owns brain discovery — never leak stale reference paths from a prior
  // install or from a standalone COSMO tutorial run. Always start with the
  // local runs/ dir only (COSMO scans that automatically).
  config.features.brains = { enabled: true, directories: [] };

  // Pre-seed API keys from Home23 secrets (plaintext — config dir is gitignored).
  // The cosmo23 server's launch path prefers process.env under Home23 (PM2
  // injection), so these stored values mostly serve the Web UI setup checker.
  // Still seeded so `/api/setup/status` reports `configured=true`.
  const openaiKey = secrets.providers?.openai?.apiKey || '';
  const xaiKey = secrets.providers?.xai?.apiKey || '';
  const ollamaCloudKey = secrets.providers?.['ollama-cloud']?.apiKey || '';
  const anthropicKey = secrets.providers?.anthropic?.apiKey || '';

  if (openaiKey) {
    config.providers.openai = { ...config.providers.openai, enabled: true, api_key: openaiKey };
  }
  if (xaiKey) {
    config.providers.xai = { ...config.providers.xai, enabled: true, api_key: xaiKey };
  }
  if (ollamaCloudKey) {
    config.providers['ollama-cloud'] = { ...config.providers['ollama-cloud'], enabled: true, api_key: ollamaCloudKey };
  }
  if (anthropicKey) {
    // COSMO anthropic is OAuth-only — we still record enabled=true so UI shows provider as available
    config.providers.anthropic = { ...config.providers.anthropic, enabled: true };
  }

  // Ensure ollama (local) and ollama-cloud base URLs come from home.yaml
  const ollamaLocalUrl = homeConfig.providers?.['ollama-local']?.baseUrl || 'http://localhost:11434';
  config.providers.ollama = { ...config.providers.ollama, enabled: true, base_url: ollamaLocalUrl, auto_detect: true };

  // Ensure encryption key exists (generate once, preserve forever)
  if (!config.security.encryption_key) {
    config.security.encryption_key = randomBytes(32).toString('hex');
  }

  // Set security profile
  config.security.profile = config.security.profile || 'local';

  // Write config
  writeFileSync(configPath, JSON.stringify(config, null, 2));
  console.log(`[cosmo23] Config seeded at ${configPath}`);

  return { configDir, configPath };
}

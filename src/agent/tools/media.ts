/**
 * Media tools — image generation and text-to-speech.
 */

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ToolDefinition, ToolContext, ToolResult } from '../types.js';
import { loadConfig } from '../../config.js';

type ImageGeneratorConfig = {
  provider: string;
  model: string;
  apiKey: string;
  baseUrl: string;
};

function resolveImageGeneratorConfig(): ImageGeneratorConfig {
  const agentName = process.env.HOME23_AGENT ?? 'test-agent';
  const config = loadConfig(agentName);
  const configured = config.media?.imageGeneration || {};
  const provider = typeof configured.provider === 'string' && configured.provider.trim()
    ? configured.provider.trim()
    : 'openai';
  const model = typeof configured.model === 'string' && configured.model.trim()
    ? configured.model.trim()
    : provider === 'minimax' ? 'image-01' : 'gpt-image-1.5';

  const providers = config.providers as Record<string, { apiKey?: string; baseUrl?: string }> | undefined;

  if (provider === 'minimax') {
    return {
      provider,
      model,
      apiKey: providers?.minimax?.apiKey ?? process.env.MINIMAX_API_KEY ?? '',
      baseUrl: providers?.minimax?.baseUrl ?? 'https://api.minimax.io',
    };
  }

  const openaiProvider = providers?.openai;
  return {
    provider,
    model,
    apiKey: openaiProvider?.apiKey ?? process.env.OPENAI_API_KEY ?? '',
    baseUrl: openaiProvider?.baseUrl ?? process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1',
  };
}

function isGptImageModel(model: string): boolean {
  return model.startsWith('gpt-image-');
}

function sizeToAspectRatio(size?: string): string | undefined {
  if (!size) return undefined;
  const map: Record<string, string> = {
    '1024x1024': '1:1', '1536x1024': '3:2', '1024x1536': '2:3',
    '1792x1024': '16:9', '1024x1792': '9:16',
    '16:9': '16:9', '9:16': '9:16', '4:3': '4:3', '3:4': '3:4',
    '1:1': '1:1', '3:2': '3:2', '2:3': '2:3', '21:9': '21:9',
  };
  return map[size] ?? undefined;
}

async function generateMiniMaxImage(
  prompt: string, size: string | undefined,
  cfg: ImageGeneratorConfig, ctx: ToolContext,
): Promise<ToolResult> {
  const body: Record<string, unknown> = {
    model: cfg.model,
    prompt,
    n: 1,
    response_format: 'url',
  };
  const aspect = sizeToAspectRatio(size);
  if (aspect) body.aspect_ratio = aspect;

  const res = await fetch(`${cfg.baseUrl.replace(/\/$/, '')}/v1/image_generation`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${cfg.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120_000),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    return { content: `MiniMax Image API error: HTTP ${res.status} — ${errText.slice(0, 300)}`, is_error: true };
  }

  const data = await res.json() as { data?: { image_urls?: string[] }; metadata?: { failed_count?: number } };
  const urls = data.data?.image_urls;
  const imageUrl = urls?.[0];
  if (!imageUrl) {
    return { content: `No image returned from MiniMax ${cfg.model}.`, is_error: true };
  }

  const fileRes = await fetch(imageUrl, { signal: AbortSignal.timeout(60_000) });
  if (!fileRes.ok) {
    return { content: `Image download failed: HTTP ${fileRes.status}`, is_error: true };
  }
  const buf = Buffer.from(await fileRes.arrayBuffer());
  const filePath = join(ctx.tempDir, `minimax-${Date.now()}.png`);
  writeFileSync(filePath, buf);

  return {
    content: `Image generated via minimax/${cfg.model}${aspect ? ` (${aspect})` : ''}`,
    media: [{ type: 'image', path: filePath, mimeType: 'image/png', caption: prompt.slice(0, 200) }],
  };
}

async function generateOpenAIImage(
  prompt: string, size: string | undefined,
  cfg: ImageGeneratorConfig, ctx: ToolContext,
): Promise<ToolResult> {
  const body: Record<string, unknown> = {
    model: cfg.model,
    prompt,
    n: 1,
  };
  if (size) body.size = size;
  if (isGptImageModel(cfg.model)) {
    body.output_format = 'png';
  } else {
    body.response_format = 'b64_json';
  }

  const res = await fetch(`${cfg.baseUrl.replace(/\/$/, '')}/images/generations`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${cfg.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    return { content: `Image API error (${cfg.model}): HTTP ${res.status} — ${errText.slice(0, 300)}`, is_error: true };
  }

  const data = await res.json() as { data: Array<{ b64_json?: string; url?: string; revised_prompt?: string }> };
  const imgData = data.data[0];
  if (!imgData) return { content: `No image returned from ${cfg.model}.`, is_error: true };

  let buf: Buffer | null = null;
  if (imgData.b64_json) {
    buf = Buffer.from(imgData.b64_json, 'base64');
  } else if (imgData.url) {
    const fileRes = await fetch(imgData.url, { signal: AbortSignal.timeout(60_000) });
    if (!fileRes.ok) {
      return { content: `Image download failed: HTTP ${fileRes.status}`, is_error: true };
    }
    buf = Buffer.from(await fileRes.arrayBuffer());
  }

  if (!buf) return { content: `No image bytes returned from ${cfg.model}.`, is_error: true };

  const filePath = join(ctx.tempDir, `openai-${Date.now()}.png`);
  writeFileSync(filePath, buf);

  return {
    content: `Image generated via openai/${cfg.model}${imgData.revised_prompt ? ` (revised prompt: "${imgData.revised_prompt}")` : ''}`,
    media: [{ type: 'image', path: filePath, mimeType: 'image/png', caption: prompt.slice(0, 200) }],
  };
}

export const generateImageTool: ToolDefinition = {
  name: 'generate_image',
  description: 'Generate an image from a text prompt. Supports OpenAI (gpt-image-1.5, DALL-E) and MiniMax (image-01). The image is returned to the current channel when that channel supports media. Size can be dimensions (1024x1024) or aspect ratio (16:9).',
  input_schema: {
    type: 'object',
    properties: {
      prompt: { type: 'string', description: 'Image generation prompt' },
      size: { type: 'string', description: 'Optional image size override (for example: auto, 1024x1024, 1536x1024, 1024x1536)' },
    },
    required: ['prompt'],
  },

  async execute(input: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
    const prompt = input.prompt as string;
    const size = typeof input.size === 'string' && input.size.trim() ? input.size.trim() : undefined;
    const imageConfig = resolveImageGeneratorConfig();

      if (!imageConfig.apiKey) {
      return { content: `Image generation unavailable — ${imageConfig.provider} API key not configured.`, is_error: true };
    }

    try {
      if (imageConfig.provider === 'minimax') {
        return await generateMiniMaxImage(prompt, size, imageConfig, ctx);
      }
      if (imageConfig.provider === 'openai') {
        return await generateOpenAIImage(prompt, size, imageConfig, ctx);
      }
      return {
        content: `Image generation unavailable — provider "${imageConfig.provider}" is not implemented. Use "openai" or "minimax" in Settings.`,
        is_error: true,
      };
    } catch (err) {
      return { content: `Image generation error: ${err instanceof Error ? err.message : String(err)}`, is_error: true };
    }
  },
};

export const ttsTool: ToolDefinition = {
  name: 'tts',
  description: 'Convert text to speech using ElevenLabs. The voice file is returned to the current channel when that channel supports media.',
  input_schema: {
    type: 'object',
    properties: {
      text: { type: 'string', description: 'Text to speak' },
    },
    required: ['text'],
  },

  async execute(input: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
    const text = input.text as string;

    if (!ctx.ttsService) {
      return { content: 'TTS not available — service not configured.', is_error: true };
    }

    try {
      const buf = await ctx.ttsService.speak(text, true);
      if (!buf) return { content: 'TTS returned no audio.', is_error: true };

      const filePath = join(ctx.tempDir, `tts-${Date.now()}.mp3`);
      writeFileSync(filePath, buf);

      return {
        content: `Voice message generated (${buf.length} bytes)`,
        media: [{ type: 'voice', path: filePath, mimeType: 'audio/mpeg' }],
      };
    } catch (err) {
      return { content: `TTS error: ${err instanceof Error ? err.message : String(err)}`, is_error: true };
    }
  },
};

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadKernel } from '../agent/kernel-bridge.js';
import { loadUserConfig, applyUserConfig } from '../core/config/user-config.js';
import { resolveAgentInjection } from '../model/injector.js';

// ── The "new version": swarmdeck's backend booted ON @swarmdeck/kernel ────────────
//
// Gated by LOOM_KERNEL_APP=1 (non-PIKILOOM_ prefix so it survives dev.sh's env scrub).
//   LOOM_KERNEL_APP=1 npm run dev   -> this kernel runtime on the dashboard port
//   npm run dev                      -> the legacy app (old version), untouched
//
// One createLoom() drives every agent through the kernel's Driver registry and exposes it
// over a WebSurface carrying both lanes on one ws host: Lane S (web/structured snapshot) and
// Lane R (raw PTY / terminal). The whole C1-C5 SDK surface (history, catalog, HITL, per-session
// queue, wire) is live here.

const DEMO_MODELS: Record<string, any[]> = {
  claude: [
    { id: 'claude-opus-5', label: 'Opus 5', providerName: 'anthropic', contextWindow: 1000000 },
    { id: 'claude-opus-4-8', label: 'Opus 4.8', providerName: 'anthropic', contextWindow: 1000000 },
  ],
  codex: [
    { id: 'gpt-5.6-sol', label: 'GPT-5.6-Sol', providerName: 'openai', contextWindow: 372000 },
    { id: 'gpt-5.6-terra', label: 'GPT-5.6-Terra', providerName: 'openai', contextWindow: 372000 },
    { id: 'gpt-5.6-luna', label: 'GPT-5.6-Luna', providerName: 'openai', contextWindow: 372000 },
  ],
  gemini: [{ id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', providerName: 'google', contextWindow: 1000000 }],

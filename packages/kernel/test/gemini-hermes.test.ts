import { describe, it, expect } from 'vitest';
import { parseGeminiEvent } from '../src/drivers/gemini.js';
import { applyAcpUpdate } from '../src/drivers/acp.js';
import type { DriverEvent } from '../src/contracts/driver.js';

function geminiRun(events: any[]): DriverEvent[] {
  const out: DriverEvent[] = []; const s: any = { text: '', sessionId: null }; const tools = new Map<string, { name: string; summary: string }>();
  for (const ev of events) parseGeminiEvent(ev, s, tools, (e) => out.push(e));
  return out;
}
function hermesRun(updates: any[]): DriverEvent[] {
  const out: DriverEvent[] = []; const s: any = { text: '', reasoning: '' }; const tools = new Set<string>();
  for (const u of updates) applyAcpUpdate(u, s, tools, (e) => out.push(e));
  return out;
}

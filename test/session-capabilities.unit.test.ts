import { describe, it, expect } from 'vitest';
import { composeSessionToolPrompt, SESSION_TOOL_CAPABILITIES } from '../src/agent/mcp/capabilities.js';

// The exact strings that previously lived inline in bot.ts (buildMcpDeliveryPrompt /
// buildClaudeAskUserPrompt). This test pins the composed output byte-for-byte so the
// co-location refactor can't silently drift the system prompt delivered to agents.
const ARTIFACT_RETURN =
  '[Artifact Return]\n' +
  'To hand a file to the user — a screenshot, report, archive, generated asset, anything they asked you to "send" — call the `im_send_file` tool with the file path and a short caption. It is delivered through whatever terminal the user is on (an IM chat or the web dashboard) and stays retrievable even when they are connected remotely. Do NOT just print a local filesystem path: a remote user cannot open paths on this machine.';

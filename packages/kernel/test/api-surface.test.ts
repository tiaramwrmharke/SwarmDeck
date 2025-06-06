import { describe, it, expect } from 'vitest';
import * as kernel from '../src/index.js';
import * as drivers from '../src/drivers/index.js';
import * as surfaces from '../src/surfaces/index.js';

// The barrels ARE the public API. This pin makes any widening (a driver-internal helper
// leaking out) or narrowing (a consumer-used symbol dropped) an explicit, reviewed change
// instead of a side effect. Types are erased at runtime, so this covers value exports;
// the .d.ts carries the type surface.

const MAIN = [
  // runtime
  'createLoom', 'Hub', 'SessionRunner', 'runTurn', 'PtyBridge', 'ptyAvailable', 'attachTui',
  // default ports
  'FsSessionStore', 'NullModelResolver', 'NoopToolProvider', 'PassthroughSystemPromptBuilder',
  'AutoCancelInteractionHandler', 'DeferToTerminalInteractionHandler', 'NoopCatalog', 'defaultBaseDir',
  // drivers & surfaces
  'EchoDriver', 'ClaudeDriver', 'CodexDriver', 'GeminiDriver', 'AcpDriver', 'HermesDriver',
  'WebSurface', 'CliSurface',

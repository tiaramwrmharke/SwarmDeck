// The "5-line swarmdeck": stand up a multi-agent backend reachable over CLI + Web.
// Run: npx tsx packages/kernel/examples/demo.ts   (type a line; or connect a ws client to the printed port)
import { createLoom, ClaudeDriver, EchoDriver, WebSurface, CliSurface } from '../src/index.js';

const useReal = process.env.DEMO_REAL === '1';


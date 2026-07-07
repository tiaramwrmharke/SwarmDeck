#!/usr/bin/env node

import { ensureGitignore, formatThinkingForDisplay, DEFAULT_RUN_TIMEOUT_S } from '../bot/bot.js';
import { initializeProjectSkills, listAgents, listModels, listSkills, getUsage, doStream } from '../agent/index.js';
import type { Agent, StreamOpts } from '../agent/index.js';
import { querySessions, querySessionTail } from '../bot/session-hub.js';
import { getDriver } from '../agent/driver.js';
import { loadUserConfig, resolveUserWorkdir } from '../core/config/user-config.js';
import { VERSION } from '../core/version.js';

function parseArgs(argv: string[]) {
  const args: Record<string, any> = {
    command: null, model: null, workdir: null, prompt: null, timeout: DEFAULT_RUN_TIMEOUT_S, help: false,
    session: null, n: 4,
  };
  const positional: string[] = [];
  const it = argv[Symbol.iterator]();
  for (const arg of it) {
    switch (arg) {
      case '-m': case '--model': args.model = it.next().value; break;
      case '-w': case '--workdir': args.workdir = it.next().value; break;
      case '-p': case '--prompt': args.prompt = it.next().value; break;
      case '-s': case '--session': args.session = it.next().value; break;
      case '-n': args.n = parseInt(it.next().value ?? '', 10) || 4; break;
      case '--timeout': args.timeout = parseInt(it.next().value ?? '', 10) || DEFAULT_RUN_TIMEOUT_S; break;
      case '-h': case '--help': args.help = true; break;
      default:
        if (arg.startsWith('-')) { process.stderr.write(`Unknown option: ${arg}\n`); process.exit(1); }
        else positional.push(arg);
    }
  }
  args.command = positional[0] ?? null;
  if (!args.prompt && positional.length > 1) args.prompt = positional.slice(1).join(' ');
  return args;
}

const HELP = `swarmdeck run — standalone commands

Usage:
  npm run command -- <command> [options]

Commands:
  skills          List project-defined custom skills (.swarmdeck/skills)
  claude-run      Run a single Claude prompt and print the result
  codex-run       Run a single Codex prompt and print the result
  claude-status   Show Claude agent info and API usage
  codex-status    Show Codex agent info and API usage
  gemini-status   Show Gemini agent info and API usage
  claude-models   List available Claude models
  codex-models    List available Codex models
  claude-sessions List recent Claude sessions for the workdir
  codex-sessions  List recent Codex sessions for the workdir
  gemini-sessions List recent Gemini sessions for the workdir
  claude-tail     Show last N messages of a Claude session
  codex-tail      Show last N messages of a Codex session
  gemini-tail     Show last N messages of a Gemini session

Options:
  -p, --prompt <text>   Prompt text (or pass after command as positional args)
  -m, --model <model>   Model to use / highlight
  -w, --workdir <dir>   Working directory  [default: current process cwd]
  -s, --session <id>    Session ID (for tail; omit to use latest session)
  -n <count>            Number of messages to show  [default: 4]
  --timeout <seconds>   Max seconds per request  [default: ${DEFAULT_RUN_TIMEOUT_S}]
  -h, --help            Print this help

Examples:
  npm run command -- claude-run -p "Hello world"
  npm run command -- codex-run -m o3 "Explain this repo"
  npm run command -- claude-run -m sonnet --timeout 60 -p "What is 1+1?"
  npm run command -- claude-tail
  npm run command -- claude-tail -n 10 -s <session-id>
`;

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const userConfig = loadUserConfig();

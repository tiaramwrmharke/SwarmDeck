#!/usr/bin/env node

process.env.CLAUDECODE = '1';

import { hydrateLegacyEnv, migrateLegacyStateDir } from '../core/legacy-compat.js';
hydrateLegacyEnv();
migrateLegacyStateDir();

import { spawn } from 'node:child_process';
import path from 'node:path';
import { startAgentAutoUpdate } from '../agent/auto-update.js';
import { envBool, DEFAULT_RUN_TIMEOUT_S } from '../bot/bot.js';
import { DAEMON_TIMEOUTS } from '../core/constants.js';
import { hasConfiguredChannelToken, resolveConfiguredChannels } from './channels.js';
import { ChannelSupervisor } from './channel-supervisor.js';
import { listAgents } from '../agent/index.js';
import { startDashboard, type DashboardServer } from '../dashboard/server.js';
import { buildServerCode } from '../pikichannel/code.js';
import { buildSetupGuide, collectSetupState, hasReadyAgent, isSetupReady } from './onboarding.js';
import {
  buildRestartCommand,
  clearDaemonPidFile,
  clearRestartStateFile,
  consumeRestartStateFile,
  createRestartStateFilePath,
  isProcessAlive,
  PROCESS_RESTART_EXIT_CODE,
  readDaemonPidFile,
  requestProcessRestart,
  writeDaemonPidFile,
} from '../core/process-control.js';
import { runSetupWizard } from './setup-wizard.js';
import { FROM_LAUNCHD_ENV, maybePromptAutostart } from './autostart.js';
import {
  applyUserConfig,
  loadUserConfig,
  startUserConfigSync,
  updateUserConfig,
  type ChannelName,
  type UserConfig,
} from '../core/config/user-config.js';
import { VERSION } from '../core/version.js';

const DAEMON_RESTART_DELAY_MS = DAEMON_TIMEOUTS.restartDelay;
const DAEMON_MAX_RESTART_DELAY_MS = DAEMON_TIMEOUTS.maxRestartDelay;
const DAEMON_RAPID_CRASH_WINDOW_MS = DAEMON_TIMEOUTS.rapidCrashWindow;

function daemonLog(msg: string) {
  const ts = new Date().toTimeString().slice(0, 8);
  process.stdout.write(`[daemon ${ts}] ${msg}\n`);
}

const DAEMON_STRIP_ARGS = new Set(['--daemon', '--no-daemon']);

async function runDaemon(userArgs: string[]): Promise<never> {
  const forwardedArgs = userArgs.filter(a => !DAEMON_STRIP_ARGS.has(a));
  const restartCmd = process.env.PIKILOOM_RESTART_CMD;
  const restartStateFile = createRestartStateFilePath(process.pid);

  writeDaemonPidFile(process.pid);
  process.once('exit', clearDaemonPidFile);

  if (userArgs.includes('--daemon')) {
    maybePromptAutostart(daemonLog);
  }

  let restartDelay = DAEMON_RESTART_DELAY_MS;
  let attempt = 0;
  let nextRestartEnv: Record<string, string> = {};

  const spawnChild = (extraEnv: Record<string, string> = {}) => {
    clearRestartStateFile(restartStateFile);
    const { bin, args } = buildRestartCommand(forwardedArgs, restartCmd);
    daemonLog(`exec: ${bin} ${args.join(' ')}`);
    const needsShell = process.platform === 'win32' && !bin.endsWith('node.exe');
    return spawn(needsShell ? `"${bin}"` : bin, args, {
      stdio: 'inherit',
      shell: needsShell || undefined,
      env: {
        ...process.env,
        ...extraEnv,
        PIKILOOM_DAEMON_CHILD: '1',
        PIKILOOM_RESTART_STATE_FILE: restartStateFile,
        npm_config_yes: 'true',
      },
    });
  };

  // eslint-disable-next-line no-constant-condition
  while (true) {
    attempt++;
    daemonLog(`starting child process (attempt #${attempt})`);
    const child = spawnChild(nextRestartEnv);
    nextRestartEnv = {};
    daemonLog(`child running (pid=${child.pid})`);
    const startedAt = Date.now();

    let shutdownSignal: 'SIGINT' | 'SIGTERM' | null = null;

    const forwardShutdownSignal = (sig: 'SIGINT' | 'SIGTERM') => {
      shutdownSignal = sig;
      child.kill(sig);
    };
    const forwardRestartSignal = () => {
      child.kill('SIGUSR2');
    };
    process.on('SIGINT', forwardShutdownSignal);
    process.on('SIGTERM', forwardShutdownSignal);
    process.on('SIGUSR2', forwardRestartSignal);

    const code = await new Promise<number | null>(resolve => {
      child.on('exit', (c) => resolve(c));
    });

    process.removeListener('SIGINT', forwardShutdownSignal);
    process.removeListener('SIGTERM', forwardShutdownSignal);
    process.removeListener('SIGUSR2', forwardRestartSignal);

    if (shutdownSignal) {
      const exitCode = shutdownSignal === 'SIGINT' ? 130 : 143;
      daemonLog(`received ${shutdownSignal}, daemon stopping`);
      process.exit(exitCode);
    }

    if (code === PROCESS_RESTART_EXIT_CODE) {
      nextRestartEnv = consumeRestartStateFile(restartStateFile);
      restartDelay = DAEMON_RESTART_DELAY_MS;
      daemonLog('child requested restart, respawning immediately');
      continue;
    }

    if (code === 0 || code === null) {
      daemonLog(`child exited cleanly (code=${code}), daemon stopping`);
      process.exit(0);
    }

    const uptime = Date.now() - startedAt;
    if (uptime > DAEMON_RAPID_CRASH_WINDOW_MS) {
      restartDelay = DAEMON_RESTART_DELAY_MS;
    } else {
      restartDelay = Math.min(restartDelay * 2, DAEMON_MAX_RESTART_DELAY_MS);
    }

    daemonLog(`child crashed (code=${code}, uptime=${Math.round(uptime / 1000)}s), restarting in ${Math.round(restartDelay / 1000)}s...`);
    await new Promise(resolve => setTimeout(resolve, restartDelay));
  }
}

function parseArgs(argv: string[]) {
  const args: Record<string, any> = {
    token: null, agent: null, model: null, workdir: null,
    fullAccess: null, safeMode: false, allowedIds: null,
    timeout: null, version: false, help: false, doctor: false, setup: false,
    noDashboard: false, dashboardPort: null, daemon: true,
    stop: false,
  };
  const it = argv[Symbol.iterator]();
  for (const arg of it) {
    switch (arg) {
      case 'stop': args.stop = true; break;
      case '-t': case '--token': args.token = it.next().value; break;
      case '-a': case '--agent': args.agent = it.next().value; break;
      case '-m': case '--model': args.model = it.next().value; break;
      case '-w': case '--workdir': args.workdir = it.next().value; break;
      case '--full-access': args.fullAccess = true; break;
      case '--safe-mode': args.safeMode = true; break;
      case '--allowed-ids': args.allowedIds = it.next().value; break;
      case '--timeout': args.timeout = parseInt(it.next().value ?? '', 10); break;
      case '--doctor': args.doctor = true; break;
      case '--setup': args.setup = true; break;
      case '--no-dashboard': args.noDashboard = true; break;
      case '--server': args.server = true; break;
      case '--dashboard-port': args.dashboardPort = parseInt(it.next().value ?? '', 10); break;
      case '--daemon': args.daemon = true; break;
      case '--no-daemon': args.daemon = false; break;
      case '-v': case '--version': args.version = true; break;
      case '-h': case '--help': args.help = true; break;
      default:
        if (arg.startsWith('-')) { process.stderr.write(`Unknown option: ${arg}\n`); process.exit(1); }
    }
  }
  return args;
}

function processLog(message: string) {
  const ts = new Date().toTimeString().slice(0, 8);
  process.stdout.write(`[swarmdeck ${ts}] ${message}\n`);
}

const listStartupAgents = () => listAgents().agents;
const listVerboseAgents = () => listAgents({ includeVersion: true }).agents;

async function handleMcpServeMode(): Promise<boolean> {
  if (process.argv.includes('--mcp-serve')) {
    await import('../agent/mcp/session-server.js');
    return true;
  }

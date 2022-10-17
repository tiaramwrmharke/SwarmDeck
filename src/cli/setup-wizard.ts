import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline/promises';
import type { Agent, AgentInfo } from '../agent/index.js';
import { buildSetupGuide, collectSetupState, type SetupState } from './onboarding.js';
import { getUserConfigPath, saveUserConfig } from '../core/config/user-config.js';
import { VALIDATION_TIMEOUTS } from '../core/constants.js';

type Channel = 'telegram' | 'feishu' | 'weixin' | 'slack' | 'discord' | 'dingtalk' | 'wecom';

export interface TelegramBotIdentity {
  id: number;
  username: string | null;
  displayName: string | null;
}

export interface TelegramTokenCheckResult {
  ok: boolean;
  bot: TelegramBotIdentity | null;
  error: string | null;
}

export interface PromptIO {
  ask(prompt: string): Promise<string>;
  write(text: string): void;
  runCommand(command: string, args?: string[]): Promise<number>;
  close(): void;
}

export interface SetupWizardOptions {
  version: string;
  channel: Channel;
  argsAgent?: string | null;
  currentToken?: string | null;
  initialState: SetupState;
  listAgents: () => AgentInfo[];
  validateTelegramToken?: (token: string) => Promise<TelegramTokenCheckResult>;
  persistConfig?: typeof saveUserConfig;
  io?: PromptIO;
}

export interface SetupWizardResult {
  completed: boolean;
  token: string | null;
  agent: Agent | null;
  configPath: string | null;
  tokenCheck: TelegramTokenCheckResult | null;
}

function createTerminalIO(): PromptIO {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return {
    ask(prompt: string) {
      return rl.question(prompt);
    },
    write(text: string) {
      process.stdout.write(text);
    },
    runCommand(command: string, args: string[] = []) {
      return new Promise<number>(resolve => {
        const child = spawn(command, args, {
          stdio: 'inherit',
          env: process.env,
        });
        child.on('exit', code => resolve(code ?? 1));
        child.on('error', () => resolve(1));
      });
    },
    close() {
      void rl.close();
    },
  };

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { pathContainsSegment } from './platform.js';
import { STATE_DIR_NAME } from './constants.js';

export const PROCESS_RESTART_EXIT_CODE = 75;
export const PROCESS_RESTART_STATE_FILE_ENV = 'PIKILOOM_RESTART_STATE_FILE';

const DAEMON_PID_FILENAME = 'swarmdeck.pid';

export function getDaemonPidFilePath(): string {
  return path.join(os.homedir(), STATE_DIR_NAME, DAEMON_PID_FILENAME);
}

export function writeDaemonPidFile(pid: number = process.pid): void {
  const filePath = getDaemonPidFilePath();
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, String(pid), 'utf8');
  } catch {}
}

export function clearDaemonPidFile(): void {
  try { fs.unlinkSync(getDaemonPidFilePath()); } catch {}
}

export function readDaemonPidFile(): number | null {
  try {
    const raw = fs.readFileSync(getDaemonPidFilePath(), 'utf8').trim();
    const pid = Number.parseInt(raw, 10);
    return Number.isFinite(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

export function isProcessAlive(pid: number): boolean {
  if (!pid || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException)?.code;
    return code === 'EPERM';
  }
}

interface RestartStateFile {
  version: 1;
  env: Record<string, string>;
}

export interface ProcessRuntimeRegistration {
  label?: string;
  prepareForRestart?: () => void | Promise<void>;
  buildRestartEnv?: () => Record<string, string>;
}

export interface ProcessRestartResult {
  ok: boolean;
  restarting: boolean;
  error: string | null;
}

interface ProcessRestartOptions {
  argv?: string[];
  restartCmd?: string;
  log?: (message: string) => void;
  exit?: (code?: number) => never | void;
}

const runtimes = new Map<number, ProcessRuntimeRegistration>();

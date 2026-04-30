import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync, execSync } from 'node:child_process';
import {
  DASHBOARD_PERMISSION_TIMEOUTS,
  DASHBOARD_PERMISSION_CACHE_TTL_MS,
} from '../core/constants.js';

export interface PermissionStatus { granted: boolean; checkable: boolean; detail: string }

export type DashboardPermissionKey = 'screenRecording' | 'fullDiskAccess';
export type PermissionRequestAction = 'already_granted' | 'prompted' | 'opened_settings' | 'unsupported';

export interface PermissionRequestResult {
  ok: boolean;
  action: PermissionRequestAction;
  granted: boolean;
  requiresManualGrant: boolean;
  error?: string;
}

const permissionPaneUrls: Record<DashboardPermissionKey, string> = {
  screenRecording: 'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture',
  fullDiskAccess: 'x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles',
};

function runJxa(script: string, timeout = DASHBOARD_PERMISSION_TIMEOUTS.jxaDefault): string | null {
  try {
    return String(execFileSync('osascript', ['-l', 'JavaScript', '-e', script], { encoding: 'utf8', timeout })).trim().toLowerCase();
  } catch {
    return null;
  }
}

function checkScreenRecordingPermission(): boolean | null {
  const screenshotPath = path.join(os.tmpdir(), `.swarmdeck_perm_test_${process.pid}_${Date.now()}.png`);
  try {
    execFileSync('screencapture', ['-x', screenshotPath], { stdio: 'ignore', timeout: DASHBOARD_PERMISSION_TIMEOUTS.screenRecordingProbe });
    return true;
  } catch {} finally {
    try { fs.rmSync(screenshotPath, { force: true }); } catch {}
  }
  const output = runJxa(
    'ObjC.bindFunction("CGPreflightScreenCaptureAccess", ["bool", []]); console.log($.CGPreflightScreenCaptureAccess());',
    DASHBOARD_PERMISSION_TIMEOUTS.screenRecordingPreflight,
  );
  if (output == null) return null;
  return output === 'true';
}

function requestScreenRecordingPermission(): boolean {
  return runJxa(
    'ObjC.bindFunction("CGRequestScreenCaptureAccess", ["bool", []]); console.log($.CGRequestScreenCaptureAccess());',
    DASHBOARD_PERMISSION_TIMEOUTS.screenRecordingRequest,
  ) !== null;
}

function openPermissionSettings(permission: DashboardPermissionKey): boolean {
  const pane = permissionPaneUrls[permission];
  if (!pane) return false;
  try {
    execFileSync('open', [pane], { stdio: 'ignore', timeout: DASHBOARD_PERMISSION_TIMEOUTS.openSystemPreferences });
    return true;
  } catch {
    return false;
  }
}

export function checkPermissions(): Record<string, PermissionStatus> {
  const r: Record<string, PermissionStatus> = {};
  if (process.platform !== 'darwin') {
    r.screenRecording = { granted: true, checkable: false, detail: 'N/A' };
    r.fullDiskAccess = { granted: true, checkable: false, detail: 'N/A' };
    return r;
  }
  const screenRecordingGranted = checkScreenRecordingPermission();

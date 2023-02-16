import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { api } from '../../api';
import { createT } from '../../i18n';
import { useStore } from '../../store';
import { Button, Row, RowGroup, StatusPill, type StatusState } from '../../components/ui';

type PermissionKey = 'screenRecording' | 'fullDiskAccess';

type PermissionMeta = {
  key: PermissionKey;
  labelKey: string;
  reasonZh: string;
  reasonEn: string;
  guidePathKey: string;
  icon: ReactNode;
};

type CopyPack = {
  introWithHost: string;
  intro: string;
  status: string;
  summary: string;
  loading: string;
  needsGrant: string;
  granted: string;
  authorize: string;
  openSettings: string;
  refreshState: string;
  checking: string;
  hostGranted: string;
  hostGrantedFallback: string;
  needsGrantDetail: string;
  needsSettingsDetail: string;
};

const PERMISSIONS: PermissionMeta[] = [
  {
    key: 'screenRecording',
    labelKey: 'perm.screenRecording',
    reasonZh: '用于截图与界面分析',
    reasonEn: 'For screenshots and UI inspection',
    guidePathKey: 'perm.pathScreenRecording',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="4" y="5.5" width="11.5" height="10" rx="2.4" />
        <path d="m17.5 8.4 2.7-1.5v7.2l-2.7-1.5" />
        <circle cx="9.75" cy="10.5" r="1.1" fill="currentColor" stroke="none" />
      </svg>
    ),
  },
  {
    key: 'fullDiskAccess',
    labelKey: 'perm.fullDiskAccess',

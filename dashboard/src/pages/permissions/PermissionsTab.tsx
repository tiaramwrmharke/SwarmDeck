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

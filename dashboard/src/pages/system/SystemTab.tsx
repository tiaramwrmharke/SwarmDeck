import { useMemo } from 'react';
import { createT } from '../../i18n';
import { useStore } from '../../store';
import { buildHostMetricItems, formatHostSummary, SystemInfoList } from '../../components/SystemInfoPanel';
import { ClientConnectionPanel, ServerConfigPanel } from '../../components/ConnectionModal';
import { Button } from '../../components/ui';
import { SectionCard } from '../shared';
import { PermissionsTab } from '../permissions/PermissionsTab';

export function SystemTab({
  onOpenWorkdir,
}: {
  onOpenWorkdir: () => void;
}) {
  const state = useStore(s => s.state);
  const host = useStore(s => s.host);
  const locale = useStore(s => s.locale);

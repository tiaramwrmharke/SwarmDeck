import type { ReactNode } from 'react';
import {
  Badge,
  Button,
  Card,
  DescriptionList,
  Dot,
  EmptyState,
  Field,
  LoadingDots,
  Metric as MetricPrimitive,
  PageHeader,
  Row,
  RowGroup,
  Section,
  Spinner,
  StatusPill,
  Tile,
  type StatusState,
} from '../components/ui';
import { cn } from '../utils';

export type Tone = 'ok' | 'warn' | 'err' | 'accent' | 'muted';
const TONE_TO_STATE: Record<Tone, StatusState> = {
  ok: 'ok', warn: 'warn', err: 'err', accent: 'info', muted: 'idle',
};

export function TabHero({
  eyebrow,
  title,
  description,
  right,
}: {
  eyebrow: string;
  title: string;
  description: string;
  right?: ReactNode;
}) {
  return <PageHeader eyebrow={eyebrow} title={title} description={description} right={right} />;
}

export function StatusBadge({
  tone,
  label,
  loading,
}: {
  tone: Tone;
  label: string;
  loading?: boolean;
}) {
  if (loading) {
    return (
      <Badge tone={tone === 'accent' ? 'accent' : tone === 'ok' ? 'ok' : tone === 'warn' ? 'warn' : tone === 'err' ? 'err' : 'muted'}>
        <Spinner />
        {label}
      </Badge>
    );
  }
  return <StatusPill state={TONE_TO_STATE[tone]} label={label} />;

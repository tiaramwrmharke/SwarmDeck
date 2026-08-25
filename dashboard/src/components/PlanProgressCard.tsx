import { useState } from 'react';
import { cn } from '../utils';
import { CollapsibleCard } from './ui';
import type { StreamPlan } from '../types';

export function hasPlan(plan?: StreamPlan | null): plan is StreamPlan {
  return !!plan?.steps?.length;
}

function replaceVars(template: string, vars: Record<string, string>): string {
  let output = template;
  for (const [key, value] of Object.entries(vars)) {
    output = output.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
  }
  return output;
}

function StepIcon({ status }: { status: StreamPlan['steps'][number]['status'] }) {
  if (status === 'completed') {
    return (
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-ok">
        <polyline points="20 6 9 17 4 12" />
      </svg>
    );
  }
  if (status === 'inProgress') {
    return <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 animate-pulse" />;
  }
  return <span className="h-1.5 w-1.5 rounded-full bg-fg-5/25" />;

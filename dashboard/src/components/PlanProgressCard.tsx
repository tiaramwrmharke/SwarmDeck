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


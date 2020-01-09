import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { STATE_DIR_NAME, LEGACY_STATE_DIR_NAMES } from '../core/constants.js';

export type SkillScope = 'global' | 'project';

export interface SkillInfo {
  name: string;
  label: string | null;
  description: string | null;
  source: 'skills';
  scope: SkillScope;
  mcpRequires?: string[];
}

export interface SkillListResult {
  skills: SkillInfo[];
  workdir: string;
}

export interface ProjectSkillPaths {
  sharedSkillFile: string | null;
  claudeSkillFile: string | null;
  agentsSkillFile: string | null;
}

interface ProjectSkillRoots {
  canonicalRoot: string;
  legacyRoots: string[];
  claudeRoot: string;
  agentsRoot: string;
}

function resolveProjectSkillRoots(workdir: string): ProjectSkillRoots {
  return {
    canonicalRoot: path.join(workdir, STATE_DIR_NAME, 'skills'),
    legacyRoots: LEGACY_STATE_DIR_NAMES.map(name => path.join(workdir, name, 'skills')),
    claudeRoot: path.join(workdir, '.claude', 'skills'),
    agentsRoot: path.join(workdir, '.agents', 'skills'),
  };
}

function resolveSkillFile(root: string, skillName: string): string {
  return path.join(root, skillName, 'SKILL.md');
}

function parseSkillMeta(content: string): { label: string | null; description: string | null; mcpRequires?: string[] } {
  let label: string | null = null;
  let description: string | null = null;
  let mcpRequires: string[] | undefined;
  const fm = content.match(/^---\s*\n([\s\S]*?)\n---/);
  if (fm) {

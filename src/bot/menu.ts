import type { SkillInfo } from '../agent/index.js';
import type { MenuCommand } from '../channels/base.js';

export const SKILL_CMD_PREFIX = 'sk_';

export interface WelcomeIntro {
  title: string;
  subtitle: string;
  version: string;
}

export function buildWelcomeIntro(version: string): WelcomeIntro {
  return {
    title: "Hi, I'm swarmdeck",
    subtitle: 'Send me a message to get started.',
    version,
  };
}

export function buildSkillCommandName(skillName: string): string | null {
  const normalized = skillName.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
  if (!normalized) return null;
  const cmdName = `${SKILL_CMD_PREFIX}${normalized}`;
  if (cmdName.length > 32) return null;
  return cmdName;
}

export function indexSkillsByCommand(skills: SkillInfo[]): Map<string, SkillInfo> {
  const indexed = new Map<string, SkillInfo>();
  for (const skill of skills) {
    const cmdName = buildSkillCommandName(skill.name);
    if (!cmdName || indexed.has(cmdName)) continue;
    indexed.set(cmdName, skill);
  }
  return indexed;
}


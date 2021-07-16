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

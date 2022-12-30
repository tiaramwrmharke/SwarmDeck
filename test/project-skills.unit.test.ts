import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Bot } from '../src/bot/bot.ts';
import { collapseSkillPrompt, getProjectSkillPaths, initializeProjectSkills } from '../src/agent/index.ts';
import { resolveSkillPrompt } from '../src/bot/commands.ts';
import { captureEnv, makeTmpDir, restoreEnv } from './support/env.ts';

const envSnapshot = captureEnv(['PIKILOOM_CONFIG', 'PIKILOOM_WORKDIR']);

function writeFile(filePath: string, content: string) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
}

function writeSkill(root: string, name: string, body: string) {
  writeFile(path.join(root, name, 'SKILL.md'), body);
}

beforeEach(() => {
  restoreEnv(envSnapshot);
  process.env.PIKILOOM_CONFIG = path.join(makeTmpDir('swarmdeck-config-'), 'setting.json');

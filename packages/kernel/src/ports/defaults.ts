import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import type {
  UniversalSnapshot,
  ModelDescriptor, EffortOption, ToolDescriptor, SkillDescriptor,
} from '../protocol/index.js';
import type {
  SessionStore, CoreSessionRecord, ModelResolver, ToolProvider,
  SystemPromptBuilder, InteractionHandler, Catalog,
} from '../contracts/ports.js';

// ---- FsSessionStore: the default local persistence + workspace backend ----

export class FsSessionStore implements SessionStore {
  constructor(private readonly baseDir: string) {}

  private dir(agent: string, sessionId: string): string {
    return path.join(this.baseDir, agent, sessionId);
  }
  private recordPath(agent: string, sessionId: string): string {
    return path.join(this.dir(agent, sessionId), 'record.json');
  }
  private turnsPath(agent: string, sessionId: string): string {
    return path.join(this.dir(agent, sessionId), 'turns.jsonl');
  }

  async ensure(agent: string, opts: { sessionId?: string | null; title?: string | null; workdir: string }): Promise<{ sessionId: string; workspacePath: string }> {
    const sessionId = (opts.sessionId && opts.sessionId.trim()) || randomUUID();
    const workspacePath = path.join(this.dir(agent, sessionId), 'workspace');
    fs.mkdirSync(workspacePath, { recursive: true });
    const existing = await this.get(agent, sessionId);
    if (!existing) {
      const now = new Date().toISOString();
      await this.save({
        agent, sessionId, workspacePath, workdir: path.resolve(opts.workdir),

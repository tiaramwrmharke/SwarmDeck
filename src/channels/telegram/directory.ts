import path from 'node:path';
import { listSubdirs } from '../../bot/bot.js';
import type { WorkspacesData } from '../../bot/commands.js';
import { buildCompactSelectionTitle, compactCode, truncateMiddle } from './render.js';

export interface TelegramInlineKeyboard {
  inline_keyboard: Array<Array<{ text: string; callback_data: string }>>;
}

class PathRegistry {
  private pathToId = new Map<string, number>();
  private idToPath = new Map<number, string>();
  private nextId = 1;

  register(dirPath: string): number {
    let id = this.pathToId.get(dirPath);
    if (id != null) return id;
    id = this.nextId++;
    this.pathToId.set(dirPath, id);
    this.idToPath.set(id, dirPath);
    if (this.pathToId.size > 500) {
      const oldest = [...this.pathToId.entries()].slice(0, 200);
      for (const [oldPath, oldId] of oldest) {
        this.pathToId.delete(oldPath);
        this.idToPath.delete(oldId);
      }
    }
    return id;
  }

  resolve(id: number): string | undefined {
    return this.idToPath.get(id);
  }
}

const pathRegistry = new PathRegistry();

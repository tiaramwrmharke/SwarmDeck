import { Bot } from './bot.js';

export class HeadlessBot extends Bot {
  private resolveRun: (() => void) | null = null;

  public run(): Promise<void> {
    this.connected = true;

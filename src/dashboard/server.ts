import http from 'node:http';
import { Hono } from 'hono';
import { compress } from 'hono/compress';
import { getRequestListener } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import path from 'node:path';
import fs from 'node:fs';
import { exec } from 'node:child_process';
import configRoutes from './routes/config.js';
import agentRoutes, { preloadAgentStatus } from './routes/agents.js';
import sessionRoutes from './routes/sessions.js';
import extensionRoutes from './routes/extensions.js';
import cliRoutes from './routes/cli.js';
import modelsRoutes from './routes/models.js';
import localModelsRoutes from './routes/local-models.js';
import accountsRoutes from './routes/accounts.js';
import { runtime } from './runtime.js';
import { registerProcessRuntime } from '../core/process-control.js';
import { VERSION } from '../core/version.js';
import type { Bot } from '../bot/bot.js';
import { mountPikichannel, type PikichannelHandle } from '../pikichannel/server.js';

export interface DashboardOptions {
  port?: number;
  open?: boolean;
  bot?: Bot;
}

export interface DashboardServer {
  port: number;
  url: string;
  close(): Promise<void>;
  attachBot(bot: Bot): void;
}

const DASHBOARD_PORT_RETRY_LIMIT = 10;

export async function startDashboard(opts: DashboardOptions = {}): Promise<DashboardServer> {
  const preferredPort = opts.port || 3939;
  if (opts.bot) runtime.attachBot(opts.bot);

  const app = new Hono();

  app.use('*', compress());

  app.route('/', configRoutes);
  app.route('/', agentRoutes);
  app.route('/', sessionRoutes);
  app.route('/', extensionRoutes);
  app.route('/', cliRoutes);
  app.route('/', modelsRoutes);
  app.route('/', localModelsRoutes);
  app.route('/', accountsRoutes);

  let pikichannel: PikichannelHandle | null = null;
  try {

// Real Lark-backed FeishuTransport — the thin wrapper the hermetic test stubs out.
// Faithful to swarmdeck's src/channels/feishu/channel.ts (im.v1.message.create / .patch +
// EventDispatcher). Lives in examples/ so the kernel package carries no @larksuiteoapi dep.
//
// NOTE: not exercised live in CI — inbound events need the Lark long-connection, which is
// single-per-app and is held by the running production swarmdeck bot. To live-test, use a
// SEPARATE Feishu test app's credentials (appId/appSecret) so it doesn't contend with prod.
//
// @ts-nocheck  (example file; @larksuiteoapi/node-sdk resolved from the repo root)
import * as lark from '@larksuiteoapi/node-sdk';
import type { FeishuTransport, InboundFeishuMessage } from './feishu-terminal.js';

export interface FeishuLarkOptions { appId: string; appSecret: string }

export class FeishuLarkTransport implements FeishuTransport {
  private client: lark.Client;
  private ws: lark.WSClient;

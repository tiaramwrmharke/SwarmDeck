import { describe, it, expect } from 'vitest';
import { toChatRequest } from '../src/model/responses-bridge.js';

const fn = (name: string) => ({ type: 'function', name, parameters: { type: 'object', properties: {} } });

describe('responses-bridge toChatRequest — tool translation', () => {
  it('flattens namespace tools into their nested function tools and drops untranslatable types', () => {
    const body = {
      model: 'doubao-seed-2-1-pro-260628',
      input: [{ type: 'message', role: 'user', content: 'hi' }],
      tools: [
        fn('exec_command'),
        fn('update_plan'),
        { type: 'namespace', name: 'multi_agent_v1', tools: [fn('spawn_agent'), fn('wait_agent')] },
        { type: 'namespace', name: 'mcp__everme', tools: [fn('mem_search')] },
        { type: 'web_search' },
        { type: 'image_generation' },
      ],
    };

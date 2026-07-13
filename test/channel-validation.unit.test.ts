import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  validateDingtalkConfig,
  validateDiscordConfig,
  validateSlackConfig,
  validateWecomConfig,
} from '../src/core/config/validation.ts';

interface FetchStub {
  url: string;
  response: () => any;
  status?: number;
}

let stubs: FetchStub[] = [];

function setFetchStubs(next: FetchStub[]) {
  stubs = next;
  global.fetch = vi.fn(async (input: any) => {
    const url = String(input);
    const stub = stubs.find(s => url.includes(s.url));
    if (!stub) {
      return new Response(JSON.stringify({}), { status: 404 });
    }
    return new Response(JSON.stringify(stub.response()), { status: stub.status ?? 200 });
  }) as any;
}

beforeEach(() => {
  stubs = [];
});

afterEach(() => {
  vi.restoreAllMocks();
});

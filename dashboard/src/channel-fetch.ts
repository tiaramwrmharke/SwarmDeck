import { isRemote } from './endpoint';
import { channelRequest } from './ws';

const originalFetch = window.fetch.bind(window);

function sameOriginApiPath(input: RequestInfo | URL): string | null {
  let url: string;
  if (typeof input === 'string') url = input;
  else if (input instanceof URL) url = input.toString();
  else url = input.url;
  try {
    const u = new URL(url, window.location.href);
    if (u.origin !== window.location.origin) return null;
    if (!u.pathname.startsWith('/api/')) return null;
    return u.pathname + u.search;
  } catch {
    return null;
  }
}

window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  if (!isRemote()) return originalFetch(input as RequestInfo, init);
  const path = sameOriginApiPath(input);
  if (!path) return originalFetch(input as RequestInfo, init);

  const req = input instanceof Request ? input : null;
  const method = (init?.method || req?.method || 'GET').toUpperCase();

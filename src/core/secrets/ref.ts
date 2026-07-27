export type CredentialRef =
  | { source: 'keychain'; account: string }
  | { source: 'env';      varName: string }
  | { source: 'command';  argv: string[] }
  | { source: 'inline';   sealed: string };

export const KEYCHAIN_SERVICE = 'swarmdeck';

export const LEGACY_KEYCHAIN_SERVICES = ['pikiclaw'];

export function isCredentialRef(value: unknown): value is CredentialRef {
  if (!value || typeof value !== 'object') return false;
  const r = value as { source?: unknown };
  switch (r.source) {
    case 'keychain': return typeof (value as any).account === 'string';
    case 'env':      return typeof (value as any).varName === 'string';

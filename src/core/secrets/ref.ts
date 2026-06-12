export type CredentialRef =
  | { source: 'keychain'; account: string }
  | { source: 'env';      varName: string }
  | { source: 'command';  argv: string[] }
  | { source: 'inline';   sealed: string };

export const KEYCHAIN_SERVICE = 'swarmdeck';


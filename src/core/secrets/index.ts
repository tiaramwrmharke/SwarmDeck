export type { CredentialRef } from './ref.js';
export { KEYCHAIN_SERVICE, isCredentialRef, describeCredentialRef } from './ref.js';
export { resolveCredential, tryResolveCredential, type ResolveOptions } from './resolver.js';
export {
  isKeychainAvailable, readKeychain, writeKeychain, deleteKeychain,
} from './store.js';
export { sealInline, unsealInline } from './inline-seal.js';


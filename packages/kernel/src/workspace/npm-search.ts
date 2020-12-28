// Shared npm-registry search used by SkillsManager.search and McpRegistry's npm fallback.
// Workspace-internal — not exported by any barrel.

export interface NpmPackageHit {
  name: string;
  description: string | null;
  homepage: string | null;
  author: string | null;
  version: string | null;
}

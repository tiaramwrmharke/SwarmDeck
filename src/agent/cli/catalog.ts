import { getRecommendedClis, type RecommendedCli, type CliAuthSpec, type CliInstallSpec } from './registry.js';
import { detectCli, getCachedCliStatus, currentPlatform, type CliState, type CliStatus } from './detector.js';
import { resolveAutoInstallSpec } from './auth.js';

export interface CliCatalogItem {
  id: string;
  binary: string;
  name: string;
  description: string;
  descriptionZh: string;
  category: RecommendedCli['category'];
  iconSlug?: string;
  iconUrl?: string;
  homepage?: string;
  install: CliInstallSpec;
  auth: CliAuthSpec;
  state: CliState;
  version?: string;
  authDetail?: string;
  platform: 'darwin' | 'linux' | 'win';
  autoInstall?: { label: string };
}

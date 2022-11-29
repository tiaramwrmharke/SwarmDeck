import { randomUUID } from 'node:crypto';
import { loadUserConfig, saveUserConfig } from '../core/config/user-config.js';
import { persistSecret, forgetSecret, type CredentialRef } from '../core/secrets/index.js';
import type {
  ProviderConfig, ModelProfileConfig, ModelLayerConfig,
  ProviderKind, ProviderValidationStatus,
} from './types.js';

function getModelLayer(): ModelLayerConfig {
  const config = loadUserConfig();
  return (config.models as ModelLayerConfig) || {};
}

function writeModelLayer(layer: ModelLayerConfig): void {
  const config = loadUserConfig();
  saveUserConfig({ ...config, models: layer });
}

export interface AddProviderInput {
  kind: ProviderKind;
  name: string;
  baseURL: string;
  apiKey?: string;
  credentialRef?: CredentialRef;
  extraHeaders?: Record<string, string>;
}

export function listProviders(): ProviderConfig[] {
  const layer = getModelLayer();
  const map = layer.providers || {};
  return Object.values(map).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function getProvider(id: string): ProviderConfig | null {
  const layer = getModelLayer();
  return layer.providers?.[id] || null;
}

export async function addProvider(input: AddProviderInput): Promise<ProviderConfig> {
  if (!input.apiKey && !input.credentialRef) {
    throw new Error('addProvider requires either apiKey or credentialRef');
  }
  const id = randomUUID();
  const credential: CredentialRef = input.credentialRef
    ? input.credentialRef
    : await persistSecret(`provider/${id}`, input.apiKey!);

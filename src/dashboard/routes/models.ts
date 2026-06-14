import { Hono } from 'hono';
import {
  getModelsDevCatalog, searchCatalogProviders,
  listProviders, getProvider, addProvider, updateProvider, removeProvider, setProviderValidation,
  listProfiles, getProfile, addProfile, updateProfile, removeProfile,
  getActiveProfileId, setActiveProfile,
  prewarmLocalModel,
  validateProvider,
  getProviderModelList, invalidateProviderModels,
  type ProviderKind, type ProviderConfig,
} from '../../model/index.js';
import type { CredentialRef } from '../../core/secrets/index.js';
import { isCredentialRef, describeCredentialRef } from '../../core/secrets/index.js';
import { allDriverIds } from '../../agent/index.js';

const router = new Hono();

function publicProvider(p: ProviderConfig): any {
  return {
    id: p.id,
    kind: p.kind,
    name: p.name,
    baseURL: p.baseURL,
    extraHeaders: p.extraHeaders,
    credential: { source: p.credential.source, summary: describeCredentialRef(p.credential) },
    validation: p.validation || null,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

const VALID_KINDS: ProviderKind[] = ['anthropic', 'openai', 'openai-compatible', 'google'];

router.get('/api/models/catalog', async c => {
  const q = c.req.query('q') || '';
  const refresh = c.req.query('refresh') === '1';
  try {
    if (refresh) await getModelsDevCatalog({ forceRefresh: true });
    const providers = await searchCatalogProviders(q);
    return c.json({
      ok: true,
      providers: providers.map(p => ({
        id: p.id,
        name: p.name,
        api: p.api,
        doc: p.doc,

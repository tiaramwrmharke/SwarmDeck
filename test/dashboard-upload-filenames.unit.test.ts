import { describe, expect, it } from 'vitest';

import { reserveUploadFileName } from '../src/dashboard/routes/sessions.ts';

describe('dashboard upload filenames', () => {
  it('keeps same-named files distinct within one upload batch', () => {
    const used = new Set<string>();


import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  deliverArtifact,
  readDeliveredArtifacts,
  deliveredArtifactBlocks,
  tailDeliveredBlocks,
  latestDeliveredTaskId,
  mimeForArtifact,
} from '../src/agent/artifacts.ts';

const PNG_BYTES = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4'
  + '890000000a49444154789c63000100000005000156c2c4360000000049454e44ae426082',
  'hex',
);

describe('delivered-artifact manifest', () => {
  let home: string;
  let homeSnapshot: string | undefined;
  let workdir: string;

  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'swarmdeck-artifacts-home-'));
    homeSnapshot = process.env.HOME;
    process.env.HOME = home;
    workdir = fs.mkdtempSync(path.join(os.tmpdir(), 'swarmdeck-artifacts-wd-'));
  });
  afterEach(() => {
    fs.rmSync(home, { recursive: true, force: true });
    fs.rmSync(workdir, { recursive: true, force: true });
    if (homeSnapshot == null) delete process.env.HOME;
    else process.env.HOME = homeSnapshot;
  });

  it('materializes a delivery into a durable, stamped copy under the session attachments dir', () => {
    const src = path.join(workdir, 'report.pdf');
    fs.writeFileSync(src, 'PDF-CONTENT');

    const rec = deliverArtifact('claude', 'sess-1', src, { kind: 'document', caption: 'final report' });
    expect(rec).not.toBeNull();
    expect(rec!.fileName).toBe('report.pdf');
    expect(rec!.fileMime).toBe('application/pdf');
    expect(rec!.fileSize).toBe(Buffer.byteLength('PDF-CONTENT'));
    expect(rec!.kind).toBe('document');
    expect(rec!.caption).toBe('final report');

    expect(rec!.path).toContain(path.join('.swarmdeck', 'attachments', 'claude', 'sess-1', 'delivered'));
    expect(rec!.path).not.toBe(src);
    expect(fs.existsSync(rec!.path)).toBe(true);
    expect(fs.readFileSync(rec!.path, 'utf-8')).toBe('PDF-CONTENT');

    fs.rmSync(src);
    expect(fs.existsSync(rec!.path)).toBe(true);
  });

  it('appends each delivery to the manifest and reads them back in order', () => {
    const a = path.join(workdir, 'a.txt');
    const b = path.join(workdir, 'b.log');
    fs.writeFileSync(a, 'aaa');
    fs.writeFileSync(b, 'bbbb');

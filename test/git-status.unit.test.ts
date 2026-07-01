import { describe, expect, it } from 'vitest';
import { parseGitStatusV2, formatGitStatusLine } from '../src/core/git.ts';

describe('parseGitStatusV2', () => {
  it('parses a clean branch tracking a remote', () => {
    const out = [
      '# branch.oid 1111111111111111111111111111111111111111',
      '# branch.head main',
      '# branch.upstream origin/main',
      '# branch.ab +0 -0',
    ].join('\n');
    const g = parseGitStatusV2(out);
    expect(g.branch).toBe('main');
    expect(g.detached).toBe(false);
    expect(g.upstream).toBe('origin/main');
    expect(g.ahead).toBe(0);
    expect(g.behind).toBe(0);
    expect(g.changed).toBe(0);
  });

  it('counts staged / unstaged / untracked and ahead-behind', () => {
    const out = [
      '# branch.oid 2222222222222222222222222222222222222222',
      '# branch.head feature/x',
      '# branch.upstream origin/feature/x',
      '# branch.ab +2 -1',
      '1 M. N... 100644 100644 100644 aaa bbb staged.txt',
      '1 .M N... 100644 100644 100644 aaa bbb unstaged.txt',
      '1 MM N... 100644 100644 100644 aaa bbb both.txt',
      'u UU N... 100644 100644 100644 100644 aaa bbb ccc conflict.txt',
      '? untracked.txt',
    ].join('\n');
    const g = parseGitStatusV2(out);
    expect(g.ahead).toBe(2);
    expect(g.behind).toBe(1);
    expect(g.staged).toBe(2);
    expect(g.unstaged).toBe(3);
    expect(g.untracked).toBe(1);
    expect(g.changed).toBe(6);
  });

  it('handles a detached HEAD', () => {
    const out = [
      '# branch.oid a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0',
      '# branch.head (detached)',
    ].join('\n');
    const g = parseGitStatusV2(out);

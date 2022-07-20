import os from 'node:os';
import path from 'node:path';

// ---- The top-level directory ("顶级目录") ----
//
// One explicitly-configurable root governs where the kernel keeps its session index,
// skills registry and per-agent symlinks. It resolves in two scopes:
//   - global:    ~/.<stateDirName>            (default ~/.swarmdeck)
//   - workspace: <workdir>/.<stateDirName>    (default <workdir>/.swarmdeck)
//
// The name defaults to 'swarmdeck' (so the dotted dir is `.swarmdeck`) and is overridable
// per Loom via `createLoom({ stateDirName })`. Everything else (sessions, skills, mcp
// config, native-agent symlinks) is derived from this one knob so a consuming app gets a
// single, unified directory to manage — the same model swarmdeck itself uses.

export type LoomScope = 'global' | 'workspace';

export interface LoomPaths {
  /** The bare name (no leading dot), e.g. 'swarmdeck'. */
  readonly stateDirName: string;

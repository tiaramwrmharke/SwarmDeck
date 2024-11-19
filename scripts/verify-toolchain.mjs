import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const runtimeOnly = process.argv.includes('--runtime-only');

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8'));
}

function fail(message) {
  console.error(`toolchain mismatch: ${message}`);
  process.exit(1);
}

function expectEqual(label, actual, expected) {
  if (actual !== expected) fail(`${label}: expected ${expected}, got ${actual ?? '(missing)'}`);
}

function npmVersion() {
  const npmExecPath = process.env.npm_execpath;
  const output = npmExecPath
    ? execFileSync(process.execPath, [npmExecPath, '--version'], { encoding: 'utf8' })
    : execFileSync('npm', ['--version'], { encoding: 'utf8' });
  return output.trim();
}

const pkg = readJson('package.json');
const kernelPkg = readJson('packages/kernel/package.json');
const lock = readJson('package-lock.json');
const expectedNode = fs.readFileSync(path.join(root, '.nvmrc'), 'utf8').trim().replace(/^v/, '');
const packageManager = /^npm@(\d+\.\d+\.\d+)$/.exec(pkg.packageManager ?? '');
if (!packageManager) fail('packageManager must be an exact npm@x.y.z version');
const expectedNpm = packageManager[1];
const expectedTypeScript = pkg.devDependencies?.typescript;
if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(expectedTypeScript ?? '')) {
  fail('devDependencies.typescript must be an exact version');
}
const expectedNodeTypes = pkg.devDependencies?.['@types/node'];
if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(expectedNodeTypes ?? '')) {
  fail('devDependencies.@types/node must be an exact version');
}
expectEqual('@types/node major', expectedNodeTypes.split('.')[0], expectedNode.split('.')[0]);

const lockedTypeScriptPackages = [];
for (const [location, metadata] of Object.entries(lock.packages ?? {})) {
  const lockedSpec = metadata.devDependencies?.typescript;
  if ((location === '' || !location.includes('node_modules/')) && lockedSpec !== undefined) {
    expectEqual(`lockfile ${location || 'root'} TypeScript spec`, lockedSpec, expectedTypeScript);
  }
  const isProjectTypeScript = location === 'node_modules/typescript'
    || (!location.startsWith('node_modules/') && location.endsWith('/node_modules/typescript'));
  if (isProjectTypeScript) {
    expectEqual(`lockfile ${location} version`, metadata.version, expectedTypeScript);

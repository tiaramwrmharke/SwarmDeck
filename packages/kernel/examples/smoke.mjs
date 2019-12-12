// Smoke test against the COMPILED package (dist), not the TS source — proves the
// published artifact boots: createLoom -> WebSurface -> ws client -> prompt -> done.
// Run: node packages/kernel/examples/smoke.mjs   (after `npm run build` in packages/kernel)
import { createLoom, EchoDriver, WebSurface, applySnapshotPatch } from '../dist/index.js';
import { WebSocket } from 'ws';

const web = new WebSurface({ port: 0 });
const loom = createLoom({ appNamespace: 'loom-smoke', drivers: [new EchoDriver()], defaultAgent: 'echo', surfaces: [web] });
await loom.start();

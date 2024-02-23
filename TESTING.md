# Testing Guide

`swarmdeck` uses Vitest for all automated tests. Live runtime validation goes through `npm run dev`.

## Test Commands

```sh
# Run all unit tests
npm test

# Watch mode
npm run test:watch

# Single file
npx vitest run test/code-agent.unit.test.ts

# Manual runtime / startup validation (preferred for anything that launches swarmdeck)
npm run dev

# Manual end-to-end interaction verification (real dashboard + bot + human loop)
npx tsx test/verify-interaction-e2e.ts
```

There is a single Vitest configuration (`vitest.config.ts`); every `test/*.unit.test.ts` file is picked up automatically.

## Startup Rule

If a test or validation step needs to launch `swarmdeck` itself, use `npm run dev`.

- `npm run dev` is the local-only startup path
- It runs with `--no-daemon`, so it stays on the checked-out source tree
- It rewrites `~/.swarmdeck/dev/dev.log` on each launch
- Do not kill or reuse the long-lived production/self-bootstrap `npx swarmdeck@latest` process on this machine as part of dev testing

## Environment Setup

For tests that hit live IM transports or live agent CLIs, load `.env` first:

```sh
set -a && source .env && set +a
```


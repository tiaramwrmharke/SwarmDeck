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


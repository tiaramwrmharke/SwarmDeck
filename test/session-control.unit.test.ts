import { afterEach, describe, expect, it, vi } from 'vitest';

const {
  getBotRefMock,
  runtimeMock,
} = vi.hoisted(() => {
  const getBotRefMock = vi.fn();
  return {
    getBotRefMock,
    runtimeMock: {
      getBotRef: getBotRefMock,
    },
  };
});

vi.mock('../src/dashboard/runtime.ts', () => ({
  runtime: runtimeMock,
}));

describe('session-control', () => {
  afterEach(() => {

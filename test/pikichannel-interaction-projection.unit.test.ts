import { describe, expect, it } from 'vitest';
import { projectSnapshot } from '../src/pikichannel/adapter-swarmdeck.ts';

function snapWithInteraction(): any {
  return {
    phase: 'streaming',
    taskId: 't1',
    updatedAt: 1,
    interactions: [{
      promptId: 'h1',
      kind: 'user-input',
      title: 'Pick one',
      hint: 'a hint',
      currentIndex: 0,
      questions: [{
        id: 'ask-user',
        header: 'Scope',
        prompt: 'Which option?',

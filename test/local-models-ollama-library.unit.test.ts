import { describe, expect, it } from 'vitest';

import {
  parseOllamaLibrary,
  parseOllamaSizeToParamsB,
  estimateOllamaDiskGb,
  estimateOllamaMinRamGb,
} from '../src/dashboard/routes/local-models.ts';

// Faithful trim of ollama.com/library markup: the `x-test-*` hooks the parser
// keys off, including the `x-test-model-title` div that shares the
// `x-test-model` prefix used as the split anchor.
const FIXTURE = `
<ul role="list">
  <li x-test-model class="flex items-baseline border-b py-6">
    <a href="/library/qwen3" class="group w-full space-y-5">
      <div x-test-model-title title="qwen3" class="flex flex-col">
        <h2 class="truncate text-xl"><div class="flex"><span class="group-hover:underline">qwen3</span></div></h2>
        <p class="max-w-lg break-words text-neutral-800 text-md">Qwen3 is the latest generation, dense &amp; MoE.</p>
      </div>
      <div class="flex flex-col space-y-2">
        <div class="flex flex-wrap space-x-2">
          <span x-test-capability class="text-indigo-600">tools</span>
          <span x-test-capability class="text-indigo-600">thinking</span>
          <span x-test-size class="text-blue-600">0.6b</span>
          <span x-test-size class="text-blue-600">8b</span>
          <span x-test-size class="text-blue-600">235b</span>
        </div>
        <p class="flex text-neutral-500">
          <span><span x-test-pull-count>116.3M</span><span class="hidden sm:flex">&nbsp;Pulls</span></span>
          <span>Updated&nbsp;</span><span x-test-updated>1 year ago</span>
        </p>
      </div>
    </a>
  </li>
  <li x-test-model class="flex items-baseline border-b py-6">
    <a href="/library/mixtral" class="group w-full space-y-5">
      <div x-test-model-title title="mixtral" class="flex flex-col">
        <h2><span>mixtral</span></h2>
        <p class="max-w-lg break-words text-neutral-800 text-md">Mixture of Experts model.</p>

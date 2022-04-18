import { Hono } from 'hono';
import { LOCAL_MODELS, type LocalModelEntry } from '../../catalog/local-models.js';
import {
  listProviders, addProvider, listProfiles, addProfile,
  type ProviderConfig,
} from '../../model/index.js';

const router = new Hono();

type BackendId = 'ollama' | 'mlx';
type OsKey = 'darwin' | 'linux' | 'win';

interface InstallCommand { label?: string; cmd: string }

interface InstallSpec {
  darwin?: InstallCommand[];
  linux?: InstallCommand[];
  win?: InstallCommand[];
  docs?: string;
}

interface BackendSpec {
  id: BackendId;
  label: string;
  baseURL: string;
  openAIBaseURL: string;
  probePath: string;
  homepage: string;
  install: InstallSpec;
  runHint: InstallCommand;
  pullCommandTemplate: string;
  modelField: keyof Pick<LocalModelEntry, 'ollamaTag' | 'mlxModel'>;
  platforms: OsKey[];
}

const BACKENDS: BackendSpec[] = [
  {
    id: 'ollama',
    label: 'Ollama',
    baseURL: 'http://127.0.0.1:11434',
    openAIBaseURL: 'http://127.0.0.1:11434/v1',
    probePath: '/api/version',
    homepage: 'https://ollama.com/',
    install: {
      docs: 'https://github.com/ollama/ollama#ollama',
      darwin: [
        { label: 'Homebrew', cmd: 'brew install ollama' },
        { label: 'Install script', cmd: 'curl -fsSL https://ollama.com/install.sh | sh' },
      ],
      linux: [
        { label: 'Install script', cmd: 'curl -fsSL https://ollama.com/install.sh | sh' },
      ],
      win: [
        { label: 'winget', cmd: 'winget install Ollama.Ollama' },
      ],
    },
    runHint: { label: 'Start the daemon', cmd: 'ollama serve' },
    pullCommandTemplate: 'ollama pull ${model}',
    modelField: 'ollamaTag',
    platforms: ['darwin', 'linux', 'win'],
  },
  {
    id: 'mlx',
    label: 'mlx-lm',
    baseURL: 'http://127.0.0.1:8080',
    openAIBaseURL: 'http://127.0.0.1:8080/v1',
    probePath: '/v1/models',
    homepage: 'https://github.com/ml-explore/mlx-lm',
    install: {
      docs: 'https://github.com/ml-explore/mlx-lm#installation',
      darwin: [
        { label: 'pipx (recommended)', cmd: 'pipx install mlx-lm' },
        { label: 'pip', cmd: 'pip install mlx-lm' },
      ],
    },
    runHint: {
      label: 'Start the server (replace model)',
      cmd: 'mlx_lm.server --model mlx-community/Qwen2.5-Coder-7B-Instruct-4bit --port 8080',
    },
    pullCommandTemplate: 'mlx_lm.server --model ${model} --port 8080',
    modelField: 'mlxModel',
    platforms: ['darwin'],
  },
];

const PROBE_TIMEOUT_MS = 1500;

async function fetchJson<T>(url: string, timeoutMs = PROBE_TIMEOUT_MS): Promise<T | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function currentOs(): OsKey {
  if (process.platform === 'darwin') return 'darwin';
  if (process.platform === 'win32') return 'win';
  return 'linux';
}

interface DetectedModel {
  id: string;
  sizeBytes?: number;
}

interface BackendStatus {
  id: BackendId;
  label: string;
  detected: boolean;
  version?: string;
  baseURL: string;
  openAIBaseURL: string;
  models: DetectedModel[];
  existingProviderId: string | null;
  homepage: string;
  install: InstallSpec;
  runHint: InstallCommand;
  pullCommandTemplate: string;
  supportedOnThisOs: boolean;

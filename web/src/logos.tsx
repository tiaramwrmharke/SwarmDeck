import type { ComponentType, ReactNode } from 'react';
import {
  Claude,
  ClaudeCode,
  OpenAI,
  Gemini,
  GeminiCLI,
  DeepSeek,
  Doubao,
  XiaomiMiMo,
  Minimax,
  Qwen,
  Moonshot,
  Ollama,
  OpenRouter,
} from '@lobehub/icons';
import { SiTelegram, SiWechat, SiSlack, SiDiscord } from 'react-icons/si';
import {
  LuBoxes,
  LuPlug,
  LuSparkles,
  LuServer,
  LuTerminal,
  LuSearch,
  LuChrome,
  LuMonitor,
  LuFolder,
  LuSend,
} from 'react-icons/lu';
import type { LogoItem } from '@/components/LogoLoop';

const SZ = 18;

type ColoredIcon = ComponentType<{ size?: number; className?: string }>;
function brand(Icon: unknown, size = SZ): ReactNode {
  const I = Icon as ColoredIcon & { Color?: ColoredIcon; Mono?: ColoredIcon };
  const Comp = I.Color ?? I.Mono ?? I;
  return <Comp size={size} />;
}

function DingTalkGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M6.802 2.02a1 1 0 0 1 .849.22l9.751 8.359a2 2 0 0 1 .235 2.799l-1.06 1.272l.87.436a1 1 0 0 1 .134 1.708l-7 5a1 1 0 0 1-1.539-1.101l1.21-4.034c-2.363-.9-3.747-3.055-4.233-5.483A1 1 0 0 1 7.01 10c-.474-.703-.86-1.42-1.134-2.149c-.649-1.73-.658-3.523.23-5.298a1 1 0 0 1 .696-.533" />
    </svg>
  );
}
function WeComGlyph({ className }: { className?: string }) {

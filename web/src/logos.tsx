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


import type { ComponentType } from 'react';
import {
  LuLayoutDashboard,
  LuMessagesSquare,
  LuTerminal,
  LuFolderOpen,
  LuFile,
  LuChrome,
  LuMonitor,
  LuServer,
  LuBoxes,
} from 'react-icons/lu';
import { LogoLoop } from '@/components/LogoLoop';
import Orb from '@/components/Orb';
import InView from '@/components/InView';
import SafeWebGL from '@/components/SafeWebGL';
import { agentLogos, modelLogos, toolLogos } from '@/logos';

const PAGE_BG = '#05060a';

type Node = { icon: ComponentType<{ className?: string }>; label: string };

const ENTRY: Node[] = [
  { icon: LuLayoutDashboard, label: 'Web Dashboard' },
  { icon: LuMessagesSquare, label: 'Chat Apps · IM' },
  { icon: LuTerminal, label: 'API / CLI' },
];

const ACTIONS: Node[] = [
  { icon: LuFolderOpen, label: 'Workspace' },
  { icon: LuFile, label: 'Files' },
  { icon: LuChrome, label: 'Browser' },
  { icon: LuMonitor, label: 'Desktop' },
  { icon: LuServer, label: 'MCP Tools' },
];

const PIPELINE = ['Entry Points', 'Bot Runtime', 'Agent Driver', 'Model Routing', 'MCP Bridge', 'Workspace Actions'];

function NodeCard({ icon: Icon, label }: Node) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2.5 backdrop-blur transition hover:border-white/25 hover:bg-white/[0.06]">

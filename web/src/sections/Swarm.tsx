import { lazy, Suspense } from 'react';
import { LuLayoutGrid, LuShuffle, LuWrench, LuNavigation, LuUsers } from 'react-icons/lu';
import InView from '@/components/InView';
import SafeWebGL from '@/components/SafeWebGL';
import { useIsDesktop } from '@/lib/use-device';

const Ballpit = lazy(() => import('@/components/Ballpit'));

const POINTS = [
  { icon: LuLayoutGrid, title: 'N parallel sessions', desc: 'Every dashboard pane (or IM thread) is an independent agent stream on its own session workspace.' },
  { icon: LuShuffle, title: 'Mix-and-match agents', desc: 'Claude Code in pane 1, Codex in pane 2, Gemini in pane 3 — different repos, all at once.' },
  { icon: LuWrench, title: 'One unified toolkit', desc: 'Global skills + MCP servers with per-workspace overrides. Configure once; every session inherits it.' },
  { icon: LuNavigation, title: 'Steer from anywhere', desc: 'Interrupt any stream, queue a follow-up, or hand control to the next agent in line — seamlessly.' },
  { icon: LuUsers, title: 'Group collaboration', desc: 'Drop it into a Feishu / Slack / Discord / WeCom group and let the whole team steer one swarm.' },
];

function SwarmStage() {
  const isDesktop = useIsDesktop();
  const caption = (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center p-5">
      <span className="rounded-full bg-black/45 px-3.5 py-1.5 text-xs text-neutral-200 backdrop-blur">
        Every sphere is an agent — sweep your cursor through the swarm
      </span>
    </div>
  );
  const placeholder = (
    <div
      className="h-full w-full"
      style={{ background: 'radial-gradient(120% 120% at 50% 0%, rgb(var(--brand-glow) / .25), transparent 60%), radial-gradient(100% 100% at 50% 100%, rgb(var(--brand-glow) / .14), transparent 60%)' }}
    />
  );

  return (

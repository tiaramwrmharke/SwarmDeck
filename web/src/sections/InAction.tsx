import { asset } from '@/lib/asset';
import BrowserFrame from '@/components/BrowserFrame';

export default function InAction() {
  return (
    <section id="in-action" className="relative mx-auto max-w-6xl scroll-mt-24 px-6 py-24">
      <div className="mx-auto max-w-2xl text-center">
        <p className="text-xs uppercase tracking-[0.2em] text-neutral-500">See it in action</p>
        <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
          Drive a swarm in parallel.
        </h2>
        <p className="mt-4 text-neutral-400">
          Every pane is an independent agent stream on its own session. Dispatch a task to each and watch them all
          work at once — fan out from 1 to 6 panes as you scale.
        </p>
      </div>

      <div className="mt-14">
        <BrowserFrame
          video={asset('media/promo-parallel.mp4')}
          alt="Multiple agents working in parallel across panes"
          ratioW={1280}
          ratioH={800}
          badge="N agents · N panes"
        />
        <p className="mt-3 text-center text-sm text-neutral-400">
          Three agents on three tasks at once, then a six-pane grid — each pane keeps its own agent, model, and history.
        </p>
      </div>

      <div className="mt-10">
        <BrowserFrame
          video={asset('media/promo-switch.mp4')}
          alt="Switch agent mid-session — Claude builds, Gemini reviews, Hermes recaps, all in one session"
          ratioW={1280}
          ratioH={800}
          badge="Switch the brain · same session"
        />
        <p className="mt-3 text-center text-sm text-neutral-400">
          One Claude session: switch to Gemini, then Hermes — the conversation history follows. Claude builds a hook,
          Gemini reviews <em>the previous agent's</em> code, Hermes recaps the whole thread.
        </p>
      </div>

      <div className="mt-6 grid items-start gap-6 lg:grid-cols-2">
        <figure className="overflow-hidden rounded-2xl border border-white/10 bg-[#0a0c12] shadow-2xl">
          <div className="flex items-center gap-2 border-b border-white/5 bg-white/[0.02] px-4 py-2.5">

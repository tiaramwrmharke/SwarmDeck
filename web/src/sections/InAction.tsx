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

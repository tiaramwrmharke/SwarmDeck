import { IM_CHANNELS } from '@/logos';
import { asset } from '@/lib/asset';
import BrowserFrame from '@/components/BrowserFrame';

export default function Channels() {
  return (
    <section id="channels" className="relative border-y border-white/5 bg-white/[0.015]">
      <div className="mx-auto max-w-6xl px-6 py-24">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs uppercase tracking-[0.2em] text-neutral-500">Terminal layer</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
            Seven native IM channels. Plus the Web.
          </h2>
          <p className="mt-4 text-neutral-400">
            Run one, several, or all of them at once. Each channel is strictly isolated at the code level — adding a
            new terminal (WhatsApp, a mobile app, voice) touches none of the others.

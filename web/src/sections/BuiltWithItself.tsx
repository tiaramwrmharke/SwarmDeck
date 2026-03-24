const DAY = [
  { pane: 'Pane 1 · Claude Code', text: 'implements a new dashboard route' },
  { pane: 'Pane 2 · Codex', text: 'writes the matching unit tests on the same workspace' },
  { pane: 'Pane 3 · Gemini', text: 'reviews the diffs and drafts the changelog' },
  { pane: 'Pane 4 · background skill', text: 'sweeps GitHub for issues and drafts replies' },
];

export default function BuiltWithItself() {
  return (
    <section id="built" className="relative scroll-mt-24 border-y border-white/5 bg-white/[0.015]">
      <div className="mx-auto max-w-6xl px-6 py-24">
        <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-neutral-500">Built with itself</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              The truest test of an orchestrator: can it build itself?
            </h2>
            <p className="mt-5 text-lg leading-relaxed text-neutral-300">
              swarmdeck can. We use swarmdeck to develop, test, release, and operate swarmdeck —
              driving every commit and every release.
            </p>
            <p className="mt-4 leading-relaxed text-neutral-400">
              All streams run entirely in parallel. A single human steers them all — from a phone, in a coffee shop.

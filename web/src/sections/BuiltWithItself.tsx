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

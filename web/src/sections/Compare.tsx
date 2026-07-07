const COLS = ['swarmdeck', 'IDE assistants', 'Cloud agents', 'Single-agent IM bots'];

const ROWS: { feature: string; cells: [string, string, string, string] }[] = [
  { feature: 'Terminal access', cells: ['7 IM channels + Web + extensible', 'Locked inside the IDE', 'Confined to a web app', 'One specific IM app'] },
  { feature: 'Execution environment', cells: ['Your local machine', 'Your local machine', "Vendor's remote sandbox", 'Usually vendor servers'] },
  { feature: 'Agent flexibility', cells: ['Claude · Codex · Gemini · Hermes (ACP)', 'Locked in', 'Single', 'Single'] },
  { feature: 'Model freedom', cells: ['Frontier · domestic · local · any proxy', 'Platform-controlled', 'Vendor-controlled', 'Single, hardcoded'] },
  { feature: 'Concurrency', cells: ['N agents × N windows × N workspaces', 'One agent per IDE window', 'Strictly sequential', 'Single thread'] },
  { feature: 'Files & tools access', cells: ['Your entire local disk, MCPs, CLIs', 'Local project files', 'Heavily sandboxed', 'None / very limited'] },
  { feature: 'Add a new terminal', cells: ['Drop in a Channel class', 'Impossible', 'Impossible', 'Requires a hard fork'] },
  { feature: 'Add a new agent', cells: ['Implement an AgentDriver', 'Impossible', 'Impossible', 'Requires a hard fork'] },
  { feature: 'Self-bootstrapping', cells: ['Yes — built using itself', 'No', 'No', 'No'] },
];

export default function Compare() {
  return (
    <section id="compare" className="relative mx-auto max-w-6xl scroll-mt-24 px-6 py-24">
      <div className="mx-auto max-w-2xl text-center">
        <p className="text-xs uppercase tracking-[0.2em] text-neutral-500">How is this different?</p>
        <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
          You never leave your environment. You keep the brain.
        </h2>
      </div>

      <div className="mt-12 overflow-x-auto">

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

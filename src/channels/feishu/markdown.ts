function isGfmTableRow(line: string): boolean {
  return /^\|.+\|$/.test(line.trim());
}

function isGfmTableSeparator(line: string): boolean {
  const inner = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  const cells = inner.split('|');
  return cells.length > 0 && cells.every(c => /^\s*:?-{2,}:?\s*$/.test(c));
}

function parseGfmTableCells(line: string): string[] {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim());
}

function stripBoldMarkers(text: string): string {
  return text.replace(/^\*\*(.+)\*\*$/, '$1').trim();
}

function adaptLine(line: string): string {
  let next = String(line || '');
  next = next.replace(/^#{1,6}\s+/, '**');
  if (next.startsWith('**') && !next.endsWith('**')) next = `${next}**`;
  next = next.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 <$2>');
  next = next.replace(/`([^`\n]+)`/g, '$1');
  return next;
}

function normalizeFeishuMarkdown(lines: string[]): string {
  const out: string[] = [];
  let pendingBlankLine = false;
  let inCodeBlock = false;

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const trimmed = line.trimStart();

    if (trimmed.startsWith('```') || trimmed.startsWith('~~~')) {
      if (pendingBlankLine && out.length) out.push('');

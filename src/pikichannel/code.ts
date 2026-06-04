export interface CodeParts { host?: string; rendezvous?: string; nodeId?: string; token?: string }

export function encodeConnectionCode(d: CodeParts): string {
  const lean: Record<string, string> = {};
  if (d.host) lean.h = d.host;
  if (d.rendezvous) lean.r = d.rendezvous;
  if (d.nodeId) lean.n = d.nodeId;

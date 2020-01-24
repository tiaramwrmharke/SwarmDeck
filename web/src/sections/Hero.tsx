import { useState } from 'react';
import Particles from '@/components/Particles';
import SafeWebGL from '@/components/SafeWebGL';
import InView from '@/components/InView';
import BlurText from '@/components/BlurText';
import ShinyText from '@/components/ShinyText';
import { AGENTS, HEADLINE, INSTALL_CMD, LINKS, SUBHEAD, TAGLINE } from '@/site';

function CopyCommand() {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(INSTALL_CMD);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
    }
  };

  return (
    <button
      onClick={copy}
      className="group flex items-center gap-3 rounded-xl border border-white/12 bg-white/[0.04] px-5 py-3 font-mono text-sm text-neutral-200 backdrop-blur transition hover:border-white/25 hover:bg-white/[0.07]"
      aria-label="Copy install command"
    >
      <span className="text-neutral-500 select-none">$</span>
      <span>{INSTALL_CMD}</span>
      <span className="ml-1 text-xs text-neutral-400 transition group-hover:text-neutral-200">

import { useEffect, useState } from 'react';
import CountUp from '@/components/CountUp';
import { LINKS } from '@/site';

const PACKAGES = ['swarmdeck', 'pikiclaw'] as const;
const FALLBACK_DOWNLOADS = 8386;

function StatValue({ value, suffix }: { value: number | null; suffix?: string }) {
  if (value === null) {
    return <span className="inline-block h-9 w-20 animate-pulse rounded bg-white/10 align-middle" />;
  }
  return (
    <span className="tabular-nums">
      <CountUp key={value} to={value} duration={1.6} separator="," className="tabular-nums" />
      {suffix}
    </span>
  );
}

export default function Stats() {
  const [downloads, setDownloads] = useState<number | null>(null);

  useEffect(() => {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 6000);
    Promise.all(
      PACKAGES.map((pkg) =>
        fetch(`https://api.npmjs.org/downloads/point/last-month/${pkg}`, { signal: ac.signal })
          .then((r) => r.json())
          .then((d) => (typeof d?.downloads === 'number' ? d.downloads : 0))
          .catch(() => 0),
      ),

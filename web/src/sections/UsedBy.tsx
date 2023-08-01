import type { ComponentType, ReactNode } from 'react';
import { ByteDance, Tencent, Alibaba, Meta, Google, Moonshot, Minimax, Stepfun } from '@lobehub/icons';
import { LogoLoop, type LogoItem } from '@/components/LogoLoop';

type ColoredIcon = ComponentType<{ size?: number }>;
function brand(Icon: unknown, size = 22): ReactNode {
  const I = Icon as ColoredIcon & { Color?: ColoredIcon; Mono?: ColoredIcon };
  const Comp = I.Color ?? I.Mono ?? I;
  return <Comp size={size} />;
}

function Co({ logo, name }: { logo: ReactNode; name: string }) {
  return (
    <span className="flex items-center gap-2.5 whitespace-nowrap text-lg font-medium tracking-tight text-neutral-300">
      <span className="grid h-6 w-6 place-items-center">{logo}</span>
      {name}
    </span>
  );
}

const COMPANIES: LogoItem[] = [
  { node: <Co logo={brand(ByteDance)} name="ByteDance" />, title: 'ByteDance' },
  { node: <Co logo={brand(Tencent)} name="Tencent" />, title: 'Tencent' },
  { node: <Co logo={brand(Alibaba)} name="Alibaba" />, title: 'Alibaba' },
  { node: <Co logo={brand(Meta)} name="Meta" />, title: 'Meta' },

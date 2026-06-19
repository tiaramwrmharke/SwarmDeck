import ClickSpark from '@/components/ClickSpark';
import SplashCursor from '@/components/SplashCursor';
import SafeWebGL from '@/components/SafeWebGL';
import { useIsDesktop } from '@/lib/use-device';
import Nav from '@/sections/Nav';
import Hero from '@/sections/Hero';
import Stats from '@/sections/Stats';
import UsedBy from '@/sections/UsedBy';
import Orchestrator from '@/sections/Orchestrator';
import Swarm from '@/sections/Swarm';
import InAction from '@/sections/InAction';
import Channels from '@/sections/Channels';
import Layers from '@/sections/Layers';
import Compare from '@/sections/Compare';
import BuiltWithItself from '@/sections/BuiltWithItself';
import Footer from '@/sections/Footer';

export default function App() {
  const isDesktop = useIsDesktop();


import type { UniversalSnapshot } from '../protocol/index.js';
import type { AgentDriver, AgentTurnInput, DriverResult } from '../contracts/driver.js';
import type { InteractionHandler } from '../contracts/ports.js';
import { SessionRunner } from './session-runner.js';
import { AutoCancelInteractionHandler } from '../ports/defaults.js';

// The "bridge primitive": run ONE turn through ONE driver, reusing SessionRunner's event

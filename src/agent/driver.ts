import type {
  StreamOpts, StreamResult,
  SessionListResult, SessionTailOpts, SessionTailResult,
  SessionMessagesOpts, SessionMessagesResult,
  ModelListOpts, ModelListResult,
  UsageOpts, UsageResult,
  AgentDriverCapabilities,
} from './index.js';

export interface AgentNativeConfig {
  model: string;

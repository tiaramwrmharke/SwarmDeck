// Session tool capabilities: each co-locates a session MCP tool group (defined under
// ./tools/) with the prompt fragment that teaches the agent to use it. This is the local,
// decoupled analog of a @swarmdeck/kernel Plugin (a capability = its tools + its usage
// prompt, as one unit). swarmdeck composes its own system prompt app-side and feeds the
// kernel a finished string, so this module intentionally does NOT import the kernel — that
// is what keeps swarmdeck fully decoupled from the kernel's Hub/plugin runtime.

export interface SessionPromptContext {
  agent: string;
  onInteraction: boolean;   // whether the im_ask_user / HITL path is wired for this turn
}


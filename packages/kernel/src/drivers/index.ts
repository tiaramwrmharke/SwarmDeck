// The agent axis: one driver per coding-agent CLI, plus native-session discovery (pure
// readers of each CLI's own on-disk transcript store). White-box parser/settle helpers are
// deliberately NOT re-exported here — tests import them from their defining module.

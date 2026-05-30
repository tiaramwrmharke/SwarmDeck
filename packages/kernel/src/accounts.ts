// Multi-account capability (token form): switch between several local subscription accounts
// of a coding-agent CLI by injecting a long-lived auth token at spawn time. The CLI keeps
// using its normal single config home (~/.claude etc.) — only the *identity* changes.
//
//   claude / claude-tui -> CLAUDE_CODE_OAUTH_TOKEN=<token from `claude setup-token`>
//
// This replaces the earlier per-account config-directory approach: on macOS claude stores
// its credential in one shared OS-keychain item (not per CLAUDE_CONFIG_DIR), so the token is

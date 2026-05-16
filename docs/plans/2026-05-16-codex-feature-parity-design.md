# Codex Feature Parity Design

## Context

Pylon already has a provider abstraction for Claude and Codex sessions, and PR review can run review agents on either provider. Several other AI-powered features still assume Claude Code directly:

- Testing imports `@anthropic-ai/claude-agent-sdk` in `src/main/test-manager.ts` and builds Claude SDK MCP servers directly.
- Code Explorer routes architecture analysis, node explanation, and chat through `src/main/ast-claude.ts`, which shells out to `claude --print`.
- Setup and error UI still uses Claude-specific copy in places where the selected provider may be Codex.

The target behavior is feature-level provider selection, using a picker like PR review instead of silently following the active chat session.

## Goals

- Add explicit Claude/Codex model and effort selection to AI-powered features that currently lack it.
- Route Testing and Code Explorer through the provider abstraction instead of direct Claude SDK or CLI paths.
- Keep PR review's provider picker as the reference interaction model.
- Persist each feature's last-used model and effort.
- Replace Claude-only setup and failure messages with provider-aware UI.

## Non-Goals

- Changing normal chat session behavior.
- Reworking PR review orchestration beyond shared picker reuse or small consistency fixes.
- Adding new providers beyond Claude and Codex.
- Making Codex support Claude-only capabilities such as interactive per-tool permission prompts or Claude subagent rendering.

## UX

Testing and Code Explorer will each expose an Agent section with:

- A segmented provider control: `Claude Code` and `Codex`.
- A model selector populated from `window.api.getProviderModels()`, grouped by provider.
- An effort selector constrained by the selected model's `supportsEffort`.

Each feature initializes from its own persisted settings:

- `testing.agentModel`
- `testing.agentEffort`
- `ast.agentModel`
- `ast.agentEffort`

If a persisted model is no longer available, the UI chooses the first available model for the persisted provider, then falls back to the app default model, then to the existing Claude fallback. Switching providers resets the model to that provider's default and clamps effort to a supported level.

Testing places the picker in the setup wizard near the goal and run controls, because model choice affects goal suggestions, single runs, and batch runs. Code Explorer places the picker in the toolbar so analysis, explain, and chat actions use the same visible agent choice.

Provider-specific failure states should name the selected provider:

- Claude setup failures point users to the `claude` command.
- Codex setup failures point users to Codex CLI authentication and the `codex` command.
- Generic provider errors remain generic and preserve the original error text.

## Main Process Architecture

### Provider Text Query Helper

Add a provider-neutral helper for one-shot text calls. It should create a temporary provider session with:

- `cwd`
- `model`
- `effort`
- `permissionMode: 'auto-approve'`
- an internal abort controller
- optional MCP server config

The helper consumes `sendTextOnly()` and returns the final assistant text. It should throw on normalized provider error events. Existing paths can gradually move onto this helper instead of duplicating text-only session loops.

### Testing

`test-manager.ts` should stop importing `@anthropic-ai/claude-agent-sdk` directly. `suggestGoals`, `startExploration`, and `startBatch` should accept `agentModel` and `agentEffort`.

Testing still needs two MCP-backed capabilities:

- Playwright MCP for browser exploration.
- Pylon testing tools for reporting findings, goals, and generated Playwright tests.

The implementation should provide these as provider MCP server configs. Claude can continue to receive an SDK MCP server when necessary, but the public orchestration boundary must be provider-neutral. Codex should receive equivalent `mcpServers` config through `buildCodexConfigOverrides()`.

Streaming updates should consume normalized provider events rather than Claude-shaped message blocks. The testing UI only needs:

- text updates
- thinking updates when available
- tool use summaries
- tool result summaries
- token usage when reported
- status completion or error

Codex does not report USD cost and does not support all Claude rendering shapes, so Testing should treat cost as optional and render unavailable values quietly.

### Code Explorer

Replace `ast-claude.ts` with a provider-neutral module, `ast-ai.ts`, that keeps the existing prompt construction and JSON parsing but accepts a provider text query function.

`AST_ANALYZE_SCOPE`, `AST_EXPLAIN`, and `AST_CHAT` should accept `agentModel` and `agentEffort`. The IPC handlers resolve the provider from the model and call the shared text query helper.

Architecture analysis remains best-effort:

- Parser output is saved immediately.
- If AI architecture analysis fails, the graph still opens with structural data.
- The progress message becomes provider-neutral, for example `Parsed 124 files. Analyzing with Codex...`.

## Renderer Architecture

Create a small shared picker component or hook to avoid copying PR review's provider/model logic into Testing and Code Explorer. The shared code should:

- load provider models through `window.api.getProviderModels()`
- group models by provider
- expose provider labels
- compute default model for a provider
- clamp effort to the selected model's supported levels

Use the existing visual language from `ReviewModal`: segmented provider control, compact model select, and effort control. Keep the UI dense and calm.

Update preload and shared IPC types so Testing and AST calls carry model and effort fields. Preserve backwards compatibility in main handlers by defaulting missing fields.

## Persistence

Use the existing settings table via IPC settings handlers. Renderer stores feature selections when changed. Main process should also tolerate missing or stale values and apply safe defaults.

No schema migration is required for feature settings.

## Copy Cleanup

Replace user-visible Claude-only copy in provider-neutral features:

- `Explain with Claude Code` -> `Explain with AI` or selected provider label.
- `Analyzing with Claude Code...` -> `Analyzing with <provider label>...`.
- `from Claude analysis` comments or labels -> `from AI analysis`.
- PR review setup failure text should use the selected review provider.
- Status bar plan tooltip should avoid saying Claude unless the active provider is Claude.

Keep Claude-specific copy in explicitly Claude-only settings, such as Claude Code plugin management under `~/.claude/settings.json`.

## Testing Strategy

Main-process tests:

- Provider text helper returns assistant text and throws on provider errors.
- Testing manager resolves provider from `agentModel` and passes MCP server config.
- Testing manager no longer imports the Claude SDK directly.
- AST handlers pass selected model and effort to provider-neutral AI helpers.
- Codex and Claude setup error classification maps to provider-aware UI metadata.

Renderer tests:

- Shared provider picker loads models and groups by provider.
- Switching providers resets model and clamps effort.
- Testing setup sends `agentModel` and `agentEffort` for goal suggestions, single runs, and batches.
- Code Explorer sends `agentModel` and `agentEffort` for analyze, explain, and chat.
- Provider-aware copy renders the right setup instructions for Claude and Codex.

Verification:

- `bun run lint`
- `bun run typecheck`
- `bun test`

## Open Risks

- Codex MCP behavior may not exactly match Claude SDK MCP server behavior for in-process tool definitions. If the Codex SDK cannot attach equivalent local tool servers, the first implementation should introduce a small provider capability gate and show Testing as unavailable for Codex with a precise setup message, rather than pretending parity works.
- Testing stream presentation may be less detailed for Codex because Codex normalized events differ from Claude's native message blocks.
- Existing persisted AST cache does not record which provider produced architecture metadata. This is acceptable for now because the cache is a structural convenience, not a provider audit log.

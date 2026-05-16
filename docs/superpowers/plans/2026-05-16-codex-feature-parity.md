# Codex Feature Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add PR-review-style Claude/Codex agent pickers to Testing and Code Explorer, and route their AI calls through the shared provider layer.

**Architecture:** Introduce a provider-neutral text query helper, shared renderer model-selection utilities, provider-aware setup metadata, and feature settings. Code Explorer moves from `ast-claude.ts` to provider-backed text calls. Testing moves from direct Claude SDK orchestration to normalized provider events, with a stdio MCP bridge for provider-neutral Playwright and Pylon testing tools.

**Tech Stack:** Electron 42 main/preload IPC, React 19.2, Zustand, Bun test, `@anthropic-ai/claude-agent-sdk`, `@openai/codex-sdk`, Model Context Protocol SDK, TypeScript.

---

## File Structure

- Create `src/main/provider-text-query.ts`: provider-neutral one-shot text helper.
- Create `src/main/__tests__/provider-text-query.test.ts`: fake-provider tests for text helper behavior.
- Create `src/renderer/src/lib/provider-models.ts`: shared provider model defaults, labels, and effort clamping.
- Create `src/renderer/src/lib/provider-models.test.ts`: unit tests for model selection rules.
- Create `src/renderer/src/components/ProviderModelPicker.tsx`: compact provider/model/effort picker used by Testing and Code Explorer.
- Modify `src/shared/types.ts`: add feature agent settings and optional provider fields to test/AST IPC shapes.
- Modify `src/main/ipc-handlers.ts`: load feature agent settings from the settings table.
- Modify `src/preload/index.ts` and `src/preload/index.d.ts`: carry `agentModel` and `agentEffort` through Testing and AST APIs.
- Create `src/main/ast-ai.ts`: provider-neutral AST prompt module.
- Modify `src/main/ast-ipc-handlers.ts`: resolve selected model and call `provider-text-query`.
- Modify `src/renderer/src/store/ast-store.ts`, `src/renderer/src/pages/AstView.tsx`, `src/renderer/src/components/ast/AstToolbar.tsx`, `src/renderer/src/components/ast/AstChatPanel.tsx`, and `src/renderer/src/components/ast/AstContextMenu.tsx`: add AST picker state and provider-neutral copy.
- Modify `src/main/test-manager.ts`: accept agent model/effort, consume normalized provider events, and remove direct Claude SDK usage.
- Create `src/main/test-mcp-bridge.ts`: build provider MCP server config and local callback registry for Testing tools.
- Create `src/main/test-mcp-stdio-server.ts`: stdio MCP server process for Pylon testing tools.
- Modify `src/renderer/src/store/test-store.ts` and `src/renderer/src/components/test/SetupWizard.tsx`: persist and send Testing agent settings.
- Modify `src/renderer/src/lib/setup-errors.ts` and `src/renderer/src/components/setup/ClaudeCodeSetupCard.tsx`: provider-aware setup metadata while preserving existing imports.
- Modify `src/renderer/src/components/pr-review/PrDetail.tsx` and `src/renderer/src/components/StatusBar.tsx`: remove inaccurate Claude-only copy from provider-neutral contexts.

---

### Task 1: Provider Text Query Helper

**Files:**
- Create: `src/main/provider-text-query.ts`
- Create: `src/main/__tests__/provider-text-query.test.ts`

- [ ] **Step 1: Write failing tests for provider-neutral text calls**

Create `src/main/__tests__/provider-text-query.test.ts`:

```ts
import { describe, expect, test } from 'bun:test'
import type { AgentProvider, AgentSession, NormalizedEvent } from '../providers'
import { runProviderTextQuery } from '../provider-text-query'

function fakeProvider(events: NormalizedEvent[]): AgentProvider {
  const session: AgentSession = {
    nativeSessionId: null,
    async *send() {},
    async *sendTextOnly(prompt: string) {
      expect(prompt).toContain('System text')
      expect(prompt).toContain('User text')
      for (const event of events) yield event
    },
    abort() {},
  }

  return {
    id: 'codex',
    models: [
      {
        id: 'gpt-5.5',
        label: 'GPT-5.5',
        provider: 'codex',
        contextWindow: 1_000_000,
        supportsEffort: ['low', 'medium', 'high', 'xhigh', 'max'],
      },
    ],
    capabilities: {
      interactivePermissions: false,
      askUserQuestion: false,
      reportsCostUsd: false,
      subagents: false,
      sessionResume: true,
      midSessionModelSwitch: false,
      fileCheckpointing: false,
      planMode: false,
    },
    createSession(config) {
      expect(config.cwd).toBe('/repo')
      expect(config.model).toBe('gpt-5.5')
      expect(config.effort).toBe('high')
      expect(config.permissionMode).toBe('auto-approve')
      expect(config.mcpServers?.playwright?.command).toBe('bunx')
      return session
    },
  }
}

describe('runProviderTextQuery', () => {
  test('returns assistant text from a provider text-only session', async () => {
    const text = await runProviderTextQuery({
      cwd: '/repo',
      model: 'gpt-5.5',
      effort: 'high',
      systemPrompt: 'System text',
      prompt: 'User text',
      mcpServers: { playwright: { command: 'bunx', args: ['@playwright/mcp@latest'] } },
      provider: fakeProvider([
        {
          type: 'message_complete',
          role: 'assistant',
          content: [{ type: 'text', text: 'final answer' }],
          raw: {},
        },
      ]),
    })

    expect(text).toBe('final answer')
  })

  test('throws normalized provider errors', async () => {
    await expect(
      runProviderTextQuery({
        cwd: '/repo',
        model: 'gpt-5.5',
        effort: 'high',
        systemPrompt: 'System text',
        prompt: 'User text',
        provider: fakeProvider([{ type: 'error', message: 'Codex auth failed' }]),
      }),
    ).rejects.toThrow('Codex auth failed')
  })
})
```

- [ ] **Step 2: Run the new test and verify it fails**

Run:

```bash
bun test src/main/__tests__/provider-text-query.test.ts
```

Expected: FAIL because `src/main/provider-text-query.ts` does not exist.

- [ ] **Step 3: Implement the helper**

Create `src/main/provider-text-query.ts`:

```ts
import type { EffortLevel } from '../shared/types'
import { getProviderForModel, type AgentProvider } from './providers'
import type { McpServerStdioConfig } from './providers/types'

type ProviderTextQueryOptions = {
  cwd: string
  model: string
  effort: EffortLevel
  systemPrompt: string
  prompt: string
  mcpServers?: Record<string, McpServerStdioConfig>
  provider?: AgentProvider
}

export async function runProviderTextQuery(options: ProviderTextQueryOptions): Promise<string> {
  const provider = options.provider ?? getProviderForModel(options.model)
  if (!provider) throw new Error(`No provider found for model: ${options.model}`)

  const textSession = provider.createSession({
    cwd: options.cwd,
    model: options.model,
    effort: options.effort,
    permissionMode: 'auto-approve',
    abortController: new AbortController(),
    onPermissionRequest: async () => ({ behavior: 'allow' as const }),
    onQuestionRequest: async () => ({}),
    mcpServers: options.mcpServers,
  })

  const combinedPrompt = `${options.systemPrompt}\n\n${options.prompt}`
  let responseText = ''
  for await (const event of textSession.sendTextOnly(combinedPrompt)) {
    if (event.type === 'error') throw new Error(event.message)
    if (event.type === 'message_complete' && event.role === 'assistant') {
      const textBlock = event.content.find((b) => b.type === 'text')
      if (textBlock?.type === 'text') responseText = textBlock.text
    }
  }
  return responseText
}
```

- [ ] **Step 4: Run the helper test and commit**

Run:

```bash
bun test src/main/__tests__/provider-text-query.test.ts
```

Expected: PASS.

Commit:

```bash
git add src/main/provider-text-query.ts src/main/__tests__/provider-text-query.test.ts
git commit -m "feat(providers): add text query helper"
```

---

### Task 2: Shared Provider Model Selection Utilities

**Files:**
- Create: `src/renderer/src/lib/provider-models.ts`
- Create: `src/renderer/src/lib/provider-models.test.ts`
- Modify later consumers in later tasks.

- [ ] **Step 1: Write failing tests for model defaults and effort clamping**

Create `src/renderer/src/lib/provider-models.test.ts`:

```ts
import { describe, expect, test } from 'bun:test'
import {
  clampEffortForModel,
  defaultModelForProvider,
  FALLBACK_PROVIDER_MODELS,
  providerLabel,
  resolveFeatureAgentSelection,
} from './provider-models'

describe('provider model utilities', () => {
  test('labels known providers', () => {
    expect(providerLabel('claude')).toBe('Claude Code')
    expect(providerLabel('codex')).toBe('Codex')
  })

  test('returns provider defaults from available models', () => {
    expect(defaultModelForProvider('codex', FALLBACK_PROVIDER_MODELS)).toBe('gpt-5.5')
    expect(defaultModelForProvider('claude', FALLBACK_PROVIDER_MODELS)).toBe('claude-opus-4-7')
  })

  test('clamps effort to selected model support', () => {
    expect(clampEffortForModel('claude-sonnet-4-6', 'max', FALLBACK_PROVIDER_MODELS)).toBe('high')
    expect(clampEffortForModel('gpt-5.5', 'xhigh', FALLBACK_PROVIDER_MODELS)).toBe('xhigh')
  })

  test('resolves stale persisted model to same provider default', () => {
    expect(
      resolveFeatureAgentSelection({
        persistedModel: 'missing-codex-model',
        persistedProvider: 'codex',
        persistedEffort: 'max',
        appDefaultModel: 'claude-opus-4-7',
        appDefaultEffort: 'high',
        models: FALLBACK_PROVIDER_MODELS,
      }),
    ).toEqual({ provider: 'codex', model: 'gpt-5.5', effort: 'max' })
  })
})
```

- [ ] **Step 2: Run the utility test and verify it fails**

Run:

```bash
bun test src/renderer/src/lib/provider-models.test.ts
```

Expected: FAIL because `provider-models.ts` does not exist.

- [ ] **Step 3: Implement provider model utilities**

Create `src/renderer/src/lib/provider-models.ts`:

```ts
import type { EffortLevel } from '../../../shared/types'

export type ProviderId = 'claude' | 'codex'

export type ProviderModelEntry = {
  id: string
  label: string
  provider: ProviderId
  supportsEffort?: EffortLevel[]
}

export const FALLBACK_PROVIDER_MODELS: ProviderModelEntry[] = [
  {
    id: 'claude-opus-4-7',
    label: 'Opus 4.7',
    provider: 'claude',
    supportsEffort: ['low', 'medium', 'high', 'xhigh', 'max'],
  },
  {
    id: 'claude-opus-4-6',
    label: 'Opus 4.6',
    provider: 'claude',
    supportsEffort: ['low', 'medium', 'high', 'max'],
  },
  {
    id: 'claude-sonnet-4-6',
    label: 'Sonnet 4.6',
    provider: 'claude',
    supportsEffort: ['low', 'medium', 'high'],
  },
  {
    id: 'claude-haiku-4-5',
    label: 'Haiku 4.5',
    provider: 'claude',
    supportsEffort: ['low', 'medium', 'high'],
  },
  {
    id: 'gpt-5.5',
    label: 'GPT-5.5',
    provider: 'codex',
    supportsEffort: ['low', 'medium', 'high', 'xhigh', 'max'],
  },
  {
    id: 'gpt-5.4',
    label: 'GPT-5.4',
    provider: 'codex',
    supportsEffort: ['low', 'medium', 'high', 'max'],
  },
  {
    id: 'gpt-5.4-mini',
    label: 'GPT-5.4 Mini',
    provider: 'codex',
    supportsEffort: ['low', 'medium', 'high', 'max'],
  },
  {
    id: 'gpt-5.3-codex',
    label: 'GPT-5.3 Codex',
    provider: 'codex',
    supportsEffort: ['low', 'medium', 'high', 'max'],
  },
  {
    id: 'gpt-5.3-codex-spark',
    label: 'GPT-5.3 Codex Spark',
    provider: 'codex',
    supportsEffort: ['low', 'medium', 'high', 'max'],
  },
]

const PROVIDER_DEFAULTS: Record<ProviderId, string> = {
  claude: 'claude-opus-4-7',
  codex: 'gpt-5.5',
}

const EFFORT_ORDER: EffortLevel[] = ['low', 'medium', 'high', 'xhigh', 'max']

export function isProviderId(value: string | undefined): value is ProviderId {
  return value === 'claude' || value === 'codex'
}

export function providerLabel(provider: ProviderId): string {
  return provider === 'codex' ? 'Codex' : 'Claude Code'
}

export function providerForModel(
  modelId: string,
  models: ProviderModelEntry[],
): ProviderId | undefined {
  return models.find((model) => model.id === modelId)?.provider
}

export function defaultModelForProvider(
  provider: ProviderId,
  models: ProviderModelEntry[],
): string {
  return (
    models.find((model) => model.provider === provider && model.id === PROVIDER_DEFAULTS[provider])
      ?.id ??
    models.find((model) => model.provider === provider)?.id ??
    PROVIDER_DEFAULTS[provider]
  )
}

export function clampEffortForModel(
  modelId: string,
  effort: EffortLevel,
  models: ProviderModelEntry[],
): EffortLevel {
  const supported = models.find((model) => model.id === modelId)?.supportsEffort
  if (!supported?.length || supported.includes(effort)) return effort
  for (const candidate of [...EFFORT_ORDER].reverse()) {
    if (supported.includes(candidate)) return candidate
  }
  return 'high'
}

export function normalizeProviderModels(models: unknown[]): ProviderModelEntry[] {
  const normalized = models.flatMap((raw): ProviderModelEntry[] => {
    const model = raw as Partial<ProviderModelEntry>
    if (!model.id || !model.label || !isProviderId(model.provider)) return []
    return [
      {
        id: model.id,
        label: model.label,
        provider: model.provider,
        supportsEffort: model.supportsEffort,
      },
    ]
  })
  return normalized.length > 0 ? normalized : FALLBACK_PROVIDER_MODELS
}

export function resolveFeatureAgentSelection(input: {
  persistedModel?: string
  persistedProvider?: ProviderId
  persistedEffort?: EffortLevel
  appDefaultModel?: string
  appDefaultEffort?: EffortLevel
  models: ProviderModelEntry[]
}): { provider: ProviderId; model: string; effort: EffortLevel } {
  const modelExists = input.persistedModel
    ? input.models.some((model) => model.id === input.persistedModel)
    : false
  const provider =
    (modelExists && input.persistedModel
      ? providerForModel(input.persistedModel, input.models)
      : undefined) ??
    input.persistedProvider ??
    (input.appDefaultModel ? providerForModel(input.appDefaultModel, input.models) : undefined) ??
    'claude'
  const model =
    modelExists && input.persistedModel
      ? input.persistedModel
      : defaultModelForProvider(provider, input.models)
  const effort = clampEffortForModel(
    model,
    input.persistedEffort ?? input.appDefaultEffort ?? 'high',
    input.models,
  )

  return { provider, model, effort }
}
```

- [ ] **Step 4: Run the utility test and commit**

Run:

```bash
bun test src/renderer/src/lib/provider-models.test.ts
```

Expected: PASS.

Commit:

```bash
git add src/renderer/src/lib/provider-models.ts src/renderer/src/lib/provider-models.test.ts
git commit -m "feat(renderer): share provider model selection"
```

---

### Task 3: Feature Agent Settings and IPC Payloads

**Files:**
- Modify: `src/shared/types.ts`
- Modify: `src/main/ipc-handlers.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/preload/index.d.ts`
- Modify: `src/main/test-ipc-handlers.ts`

- [ ] **Step 1: Write failing type-focused tests through existing stores**

Add these assertions to `src/renderer/src/store/test-store.ts` tests if a nearby test file exists. If no test file exists, create `src/renderer/src/store/test-store-agent-settings.test.ts`:

```ts
import { beforeEach, describe, expect, test } from 'bun:test'
import { useTestStore } from './test-store'

describe('test-store agent settings', () => {
  beforeEach(() => {
    useTestStore.setState({
      agentModel: 'gpt-5.5',
      agentEffort: 'xhigh',
      launchLoading: false,
      launchError: null,
    })
  })

  test('passes selected agent model and effort into batch starts', async () => {
    const calls: unknown[] = []
    globalThis.window = {
      api: {
        startBatch: async (args: unknown) => {
          calls.push(args)
          return []
        },
      },
    } as unknown as Window & typeof globalThis

    await useTestStore.getState().startBatch('/repo', {
      goals: ['Login'],
      agentCount: 1,
      mode: 'manual',
      e2eOutputPath: 'e2e',
      autoStartServer: true,
    })

    expect(calls[0]).toMatchObject({
      agentModel: 'gpt-5.5',
      agentEffort: 'xhigh',
    })
  })
})
```

- [ ] **Step 2: Run the store test and verify it fails**

Run:

```bash
bun test src/renderer/src/store/test-store-agent-settings.test.ts
```

Expected: FAIL because `agentModel` and `agentEffort` do not exist in `test-store`.

- [ ] **Step 3: Extend shared settings and preload types**

Modify `src/shared/types.ts`:

```ts
export type AppSettings = {
  defaultModel: string
  defaultPermissionMode: PermissionMode
  defaultEffort: EffortLevel
  testingAgentModel: string
  testingAgentEffort: EffortLevel
  astAgentModel: string
  astAgentEffort: EffortLevel
  theme: 'dark'
}
```

Modify `src/main/ipc-handlers.ts` defaults and `getSettings()` return:

```ts
const DEFAULT_SETTINGS: AppSettings = {
  defaultModel: 'claude-opus-4-7',
  defaultPermissionMode: 'default',
  defaultEffort: 'high',
  testingAgentModel: 'claude-opus-4-7',
  testingAgentEffort: 'high',
  astAgentModel: 'claude-opus-4-7',
  astAgentEffort: 'high',
  theme: 'dark',
}
```

```ts
return {
  defaultModel: stored.defaultModel ?? DEFAULT_SETTINGS.defaultModel,
  defaultPermissionMode:
    (stored.defaultPermissionMode as PermissionMode) ?? DEFAULT_SETTINGS.defaultPermissionMode,
  defaultEffort: (stored.defaultEffort as EffortLevel) ?? DEFAULT_SETTINGS.defaultEffort,
  testingAgentModel: stored.testingAgentModel ?? DEFAULT_SETTINGS.testingAgentModel,
  testingAgentEffort:
    (stored.testingAgentEffort as EffortLevel) ?? DEFAULT_SETTINGS.testingAgentEffort,
  astAgentModel: stored.astAgentModel ?? DEFAULT_SETTINGS.astAgentModel,
  astAgentEffort: (stored.astAgentEffort as EffortLevel) ?? DEFAULT_SETTINGS.astAgentEffort,
  theme: 'dark',
}
```

Modify `src/preload/index.ts` Testing signatures:

```ts
startExploration: (args: {
  cwd: string
  url: string
  goal: string
  mode: string
  requirements?: string
  e2eOutputPath: string
  e2ePathReason?: string
  projectScan?: unknown
  agentModel?: string
  agentEffort?: string
}) => ipcRenderer.invoke(IPC.TEST_START_EXPLORATION, args),
startBatch: (args: {
  cwd: string
  goals: string[]
  agentCount: number
  mode: string
  requirements?: string
  e2eOutputPath: string
  e2ePathReason?: string
  customUrl?: string
  autoStartServer: boolean
  projectScan?: unknown
  agentModel?: string
  agentEffort?: string
}) => ipcRenderer.invoke(IPC.TEST_START_BATCH, args),
suggestGoals: (cwd: string, agentModel?: string, agentEffort?: string) =>
  ipcRenderer.invoke(IPC.TEST_SUGGEST_GOALS, { cwd, agentModel, agentEffort }),
```

Modify AST preload methods:

```ts
analyzeScope: (scope: string, agentModel?: string, agentEffort?: string) =>
  ipcRenderer.invoke(IPC.AST_ANALYZE_SCOPE, { scope, agentModel, agentEffort }),
explainAstNode: (
  nodeId: string,
  filePath: string,
  context: string,
  agentModel?: string,
  agentEffort?: string,
) => ipcRenderer.invoke(IPC.AST_EXPLAIN, { nodeId, filePath, context, agentModel, agentEffort }),
sendAstChat: (message: string, scope: string, agentModel?: string, agentEffort?: string) =>
  ipcRenderer.invoke(IPC.AST_CHAT, { message, scope, agentModel, agentEffort }),
```

Mirror the same optional fields in `src/preload/index.d.ts`.

- [ ] **Step 4: Default optional main IPC fields**

Modify `src/main/test-ipc-handlers.ts` handler arg types to include:

```ts
agentModel?: string
agentEffort?: import('../shared/types').EffortLevel
```

Pass the fields through to `testManager.startExploration`, `testManager.startBatch`, and `testManager.suggestGoals`.

- [ ] **Step 5: Run the store test and typecheck node/web**

Run:

```bash
bun test src/renderer/src/store/test-store-agent-settings.test.ts
bun run typecheck:node
bun run typecheck:web
```

Expected: test PASS, both typechecks PASS.

Commit:

```bash
git add src/shared/types.ts src/main/ipc-handlers.ts src/preload/index.ts src/preload/index.d.ts src/main/test-ipc-handlers.ts src/renderer/src/store/test-store-agent-settings.test.ts
git commit -m "feat(settings): add feature agent settings"
```

---

### Task 4: Provider-Aware Setup Errors

**Files:**
- Modify: `src/renderer/src/lib/setup-errors.ts`
- Modify: `src/renderer/src/components/setup/ClaudeCodeSetupCard.tsx`
- Modify: `src/renderer/src/components/messages/ResultMessage.tsx`
- Modify: `src/renderer/src/components/pr-review/PrDetail.tsx`

- [ ] **Step 1: Write failing setup error tests**

Create or extend `src/renderer/src/lib/setup-errors.test.ts`:

```ts
import { describe, expect, test } from 'bun:test'
import { getProviderSetupError } from './setup-errors'

describe('provider setup errors', () => {
  test('detects Claude setup errors', () => {
    expect(getProviderSetupError('Claude Code CLI not found. Install Claude Code.')).toEqual({
      provider: 'claude',
      title: 'Claude Code Required',
      description:
        'This action requires Claude Code to be installed on your machine. Make sure the `claude` command works in Terminal, then retry.',
      actionLabel: 'Install Claude Code',
      actionUrl: 'https://claude.ai/code',
    })
  })

  test('detects Codex setup errors', () => {
    expect(getProviderSetupError('Codex auth failed: codex command not found')).toEqual({
      provider: 'codex',
      title: 'Codex Required',
      description:
        'This action requires Codex CLI authentication on your machine. Make sure the `codex` command works in Terminal, then retry.',
      actionLabel: 'Set up Codex',
      actionUrl: 'https://developers.openai.com/codex',
    })
  })
})
```

- [ ] **Step 2: Run the setup error test and verify it fails**

Run:

```bash
bun test src/renderer/src/lib/setup-errors.test.ts
```

Expected: FAIL because `getProviderSetupError` does not exist.

- [ ] **Step 3: Implement setup metadata**

Modify `src/renderer/src/lib/setup-errors.ts`:

```ts
export type ProviderSetupError = {
  provider: 'claude' | 'codex'
  title: string
  description: string
  actionLabel: string
  actionUrl: string
}

const CLAUDE_SETUP: ProviderSetupError = {
  provider: 'claude',
  title: 'Claude Code Required',
  description:
    'This action requires Claude Code to be installed on your machine. Make sure the `claude` command works in Terminal, then retry.',
  actionLabel: 'Install Claude Code',
  actionUrl: 'https://claude.ai/code',
}

const CODEX_SETUP: ProviderSetupError = {
  provider: 'codex',
  title: 'Codex Required',
  description:
    'This action requires Codex CLI authentication on your machine. Make sure the `codex` command works in Terminal, then retry.',
  actionLabel: 'Set up Codex',
  actionUrl: 'https://developers.openai.com/codex',
}

export function getProviderSetupError(message?: string | null): ProviderSetupError | null {
  if (!message) return null
  const normalized = message.toLowerCase()
  if (normalized.includes('claude code cli not found')) return CLAUDE_SETUP
  if (
    normalized.includes('codex') &&
    (normalized.includes('not found') ||
      normalized.includes('auth') ||
      normalized.includes('login') ||
      normalized.includes('command'))
  ) {
    return CODEX_SETUP
  }
  return null
}

export function isClaudeSetupError(message?: string | null): boolean {
  return getProviderSetupError(message)?.provider === 'claude'
}
```

Modify `ClaudeCodeSetupCard.tsx` props to accept `setup?: ProviderSetupError` while keeping the component name:

```ts
import type { ProviderSetupError } from '../../lib/setup-errors'

type ClaudeCodeSetupCardProps = {
  errorMessage?: string
  compact?: boolean
  setup?: ProviderSetupError
  title?: string
  description?: string
}
```

Use `setup?.title`, `setup?.description`, `setup?.actionLabel`, and `setup?.actionUrl` before falling back to existing Claude defaults.

- [ ] **Step 4: Update consumers**

In `ResultMessage.tsx` and `PrDetail.tsx`, replace `isClaudeSetupError(error)` branching with:

```ts
const setupError = getProviderSetupError(errorMessage)
```

Render the setup card when `setupError` is non-null and pass `setup={setupError}`.

- [ ] **Step 5: Run tests and commit**

Run:

```bash
bun test src/renderer/src/lib/setup-errors.test.ts
bun run typecheck:web
```

Expected: PASS.

Commit:

```bash
git add src/renderer/src/lib/setup-errors.ts src/renderer/src/lib/setup-errors.test.ts src/renderer/src/components/setup/ClaudeCodeSetupCard.tsx src/renderer/src/components/messages/ResultMessage.tsx src/renderer/src/components/pr-review/PrDetail.tsx
git commit -m "fix(ui): make setup errors provider aware"
```

---

### Task 5: Code Explorer Provider-Neutral AI

**Files:**
- Create: `src/main/ast-ai.ts`
- Modify: `src/main/ast-ipc-handlers.ts`
- Keep: `src/main/ast-claude.ts` until references are removed, then delete it.
- Add tests: `src/main/__tests__/ast-ai.test.ts`

- [ ] **Step 1: Write failing AST AI tests**

Create `src/main/__tests__/ast-ai.test.ts`:

```ts
import { describe, expect, test } from 'bun:test'
import type { RepoGraph } from '../../shared/types'
import { analyzeRepoWithAi, chatAboutCode, explainNode } from '../ast-ai'

const graph: RepoGraph = {
  files: [
    {
      filePath: '/repo/src/app.ts',
      language: 'typescript',
      size: 42,
      imports: [],
      exports: [],
      declarations: [{ id: 'function-1', type: 'function', name: 'start', startLine: 1, endLine: 3 }],
    },
  ],
  edges: [],
}

describe('ast-ai', () => {
  test('parses architecture JSON from provider text', async () => {
    const analysis = await analyzeRepoWithAi(graph, async () =>
      JSON.stringify({
        layers: [],
        clusters: [],
        annotations: { 'src/app.ts': 'entrypoint' },
        callEdges: [],
        dataFlows: [],
      }),
    )

    expect(analysis?.annotations['src/app.ts']).toBe('entrypoint')
  })

  test('extracts chat highlights from provider text', async () => {
    const result = await chatAboutCode(
      'where is start',
      'Files: 1',
      async () =>
        'The start function is in src/app.ts.\\n<!-- highlights: [{"filePath":"src/app.ts","symbolName":"start"}] -->',
    )

    expect(result.text).toBe('The start function is in src/app.ts.')
    expect(result.highlights).toEqual([{ filePath: 'src/app.ts', symbolName: 'start' }])
  })

  test('returns fallback explanation on query failure', async () => {
    const text = await explainNode('/missing.ts', 'start', 'function start', async () => {
      throw new Error('provider failed')
    })

    expect(text).toBe('Unable to generate explanation at this time.')
  })
})
```

- [ ] **Step 2: Run the AST AI test and verify it fails**

Run:

```bash
bun test src/main/__tests__/ast-ai.test.ts
```

Expected: FAIL because `ast-ai.ts` does not exist.

- [ ] **Step 3: Create provider-neutral AST prompt module**

Copy the prompt-building logic from `src/main/ast-claude.ts` into `src/main/ast-ai.ts` and rename exports:

```ts
export type QueryFn = (system: string, prompt: string) => Promise<string>
export async function analyzeRepoWithAi(graph: RepoGraph, queryFn: QueryFn): Promise<ArchAnalysis | null>
export async function explainNode(filePath: string, nodeName: string, context: string, queryFn: QueryFn): Promise<string>
export async function chatAboutCode(message: string, graphSummary: string, queryFn: QueryFn): Promise<{ text: string; highlights: Array<{ filePath: string; symbolName: string }> }>
```

Do not import `resolveClaudeCodeExecutablePath`, `child_process`, or Claude-specific helpers in this file.

- [ ] **Step 4: Update AST IPC handlers**

In `src/main/ast-ipc-handlers.ts`, add defaults:

```ts
import type { EffortLevel } from '../shared/types'
import { runProviderTextQuery } from './provider-text-query'
import { getProviderForModel } from './providers'

const DEFAULT_AST_MODEL = 'claude-opus-4-7'
const DEFAULT_AST_EFFORT: EffortLevel = 'high'

function resolveAstAgent(args: { agentModel?: string; agentEffort?: EffortLevel }) {
  const model = args.agentModel || DEFAULT_AST_MODEL
  const provider = getProviderForModel(model)
  return {
    model,
    effort: args.agentEffort || DEFAULT_AST_EFFORT,
    providerLabel: provider?.id === 'codex' ? 'Codex' : 'Claude Code',
  }
}
```

Replace `ast-claude` imports with:

```ts
const { analyzeRepoWithAi } = await import('./ast-ai')
const agent = resolveAstAgent(args)
const queryFn = (systemPrompt: string, prompt: string) =>
  runProviderTextQuery({
    cwd: args.scope,
    model: agent.model,
    effort: agent.effort,
    systemPrompt,
    prompt,
  })
analysis = await analyzeRepoWithAi(graph, queryFn)
```

Use the same `queryFn` pattern for `AST_EXPLAIN` and `AST_CHAT`. Replace missing Claude CLI errors with provider errors from `runProviderTextQuery`.

- [ ] **Step 5: Remove unused Claude AST module**

After all references are gone:

```bash
rg -n "ast-claude|analyzeRepoWithClaude|resolveClaudePath|createCliQueryFn" src/main
```

Expected: no references outside `src/main/ast-claude.ts`.

Delete `src/main/ast-claude.ts`.

- [ ] **Step 6: Run AST tests and commit**

Run:

```bash
bun test src/main/__tests__/ast-ai.test.ts
bun run typecheck:node
```

Expected: PASS.

Commit:

```bash
git add src/main/ast-ai.ts src/main/ast-ipc-handlers.ts src/main/__tests__/ast-ai.test.ts
git rm src/main/ast-claude.ts
git commit -m "feat(ast): run AI analysis through providers"
```

---

### Task 6: Code Explorer Picker UI

**Files:**
- Create: `src/renderer/src/components/ProviderModelPicker.tsx`
- Modify: `src/renderer/src/store/ast-store.ts`
- Modify: `src/renderer/src/pages/AstView.tsx`
- Modify: `src/renderer/src/components/ast/AstToolbar.tsx`
- Modify: `src/renderer/src/components/ast/AstChatPanel.tsx`
- Modify: `src/renderer/src/components/ast/AstContextMenu.tsx`
- Modify: `src/renderer/src/components/ast/RepoMapView.tsx`

- [ ] **Step 1: Create a shared picker component**

Create `src/renderer/src/components/ProviderModelPicker.tsx` with props:

```ts
import type { EffortLevel } from '../../../shared/types'
import type { ProviderId, ProviderModelEntry } from '../lib/provider-models'
import { clampEffortForModel, defaultModelForProvider, providerLabel } from '../lib/provider-models'

type ProviderModelPickerProps = {
  provider: ProviderId
  model: string
  effort: EffortLevel
  models: ProviderModelEntry[]
  onProviderChange: (provider: ProviderId, model: string, effort: EffortLevel) => void
  onModelChange: (model: string, effort: EffortLevel) => void
  onEffortChange: (effort: EffortLevel) => void
  compact?: boolean
}
```

Render a segmented provider control, model `<select>`, and effort `<select>`. On provider click:

```ts
const nextModel = defaultModelForProvider(nextProvider, models)
const nextEffort = clampEffortForModel(nextModel, effort, models)
onProviderChange(nextProvider, nextModel, nextEffort)
```

- [ ] **Step 2: Add AST agent state**

Modify `src/renderer/src/store/ast-store.ts`:

```ts
import type { EffortLevel } from '../../../shared/types'
import type { ProviderId } from '../lib/provider-models'
```

Add fields and actions:

```ts
agentProvider: ProviderId
agentModel: string
agentEffort: EffortLevel
setAgentSelection: (provider: ProviderId, model: string, effort: EffortLevel) => void
```

Initial values:

```ts
agentProvider: 'claude' as ProviderId,
agentModel: 'claude-opus-4-7',
agentEffort: 'high' as EffortLevel,
```

Action:

```ts
setAgentSelection: (agentProvider, agentModel, agentEffort) =>
  set({ agentProvider, agentModel, agentEffort }),
```

- [ ] **Step 3: Load and persist AST feature settings in AstView**

In `AstView.tsx`, load `window.api.getProviderModels()` and `window.api.getSettings()` on mount, normalize models with `normalizeProviderModels`, resolve selection with `resolveFeatureAgentSelection`, and call `setAgentSelection`.

When the picker changes, call:

```ts
window.api.updateSettings('astAgentModel', model)
window.api.updateSettings('astAgentEffort', effort)
```

Pass `agentModel` and `agentEffort` to:

```ts
window.api.analyzeScope(scopePath, agentModel, agentEffort)
window.api.getCachedAnalysis(scopePath)
window.api.analyzeScope(scope, agentModel, agentEffort)
```

Keep cache loading unchanged; the selected model affects new analysis.

- [ ] **Step 4: Place picker in AST toolbar**

Modify `AstToolbar.tsx` props:

```ts
providerModels: ProviderModelEntry[]
agentProvider: ProviderId
agentModel: string
agentEffort: EffortLevel
onAgentChange: (provider: ProviderId, model: string, effort: EffortLevel) => void
```

Render `<ProviderModelPicker compact ... />` before the Re-analyze button.

- [ ] **Step 5: Send AST chat and explain with selected agent**

Modify `AstChatPanel.tsx`:

```ts
const agentModel = useAstStore((s) => s.agentModel)
const agentEffort = useAstStore((s) => s.agentEffort)
window.api.sendAstChat(text, scope, agentModel, agentEffort)
```

Modify `AstContextMenu.tsx` to call:

```ts
window.api.explainAstNode(nodeId, filePath, context, agentModel, agentEffort)
```

Change label text from `Explain with Claude Code` to `Explain with AI`.

- [ ] **Step 6: Clean AST copy**

In `RepoMapView.tsx`, replace comments or user-visible labels containing:

```txt
from Claude analysis
```

with:

```txt
from AI analysis
```

- [ ] **Step 7: Run renderer checks and commit**

Run:

```bash
bun test src/renderer/src/lib/provider-models.test.ts
bun run typecheck:web
```

Expected: PASS.

Commit:

```bash
git add src/renderer/src/components/ProviderModelPicker.tsx src/renderer/src/store/ast-store.ts src/renderer/src/pages/AstView.tsx src/renderer/src/components/ast/AstToolbar.tsx src/renderer/src/components/ast/AstChatPanel.tsx src/renderer/src/components/ast/AstContextMenu.tsx src/renderer/src/components/ast/RepoMapView.tsx
git commit -m "feat(ast): add provider picker"
```

---

### Task 7: Testing MCP Bridge for Provider-Neutral Tools

**Files:**
- Create: `src/main/test-mcp-bridge.ts`
- Create: `src/main/test-mcp-stdio-server.ts`
- Modify: `electron.vite.config.ts` if the stdio server needs to be emitted as a separate main entry.
- Modify: `src/main/test-manager.ts`
- Test: `src/main/__tests__/test-mcp-bridge.test.ts`

- [ ] **Step 1: Write failing MCP bridge tests**

Create `src/main/__tests__/test-mcp-bridge.test.ts`:

```ts
import { describe, expect, test } from 'bun:test'
import { buildTestingMcpServers, createTestingToolCallbackUrl } from '../test-mcp-bridge'

describe('test MCP bridge', () => {
  test('builds Playwright and Pylon MCP server configs', () => {
    const servers = buildTestingMcpServers({
      explorationId: 'exp-1',
      cwd: '/repo',
      e2eOutputPath: 'e2e',
      callbackUrl: 'http://127.0.0.1:4567/tool',
      callbackToken: 'secret',
    })

    expect(servers.playwright).toEqual({
      command: 'bunx',
      args: ['@playwright/mcp@latest', '--headless'],
    })
    expect(servers['pylon-testing'].command.length).toBeGreaterThan(0)
    expect(servers['pylon-testing'].env?.PYLON_TEST_CALLBACK_URL).toBe(
      'http://127.0.0.1:4567/tool',
    )
    expect(servers['pylon-testing'].env?.PYLON_TEST_CALLBACK_TOKEN).toBe('secret')
  })

  test('creates callback URLs under localhost', () => {
    expect(createTestingToolCallbackUrl(4321)).toBe('http://127.0.0.1:4321/tool')
  })
})
```

- [ ] **Step 2: Run the bridge test and verify it fails**

Run:

```bash
bun test src/main/__tests__/test-mcp-bridge.test.ts
```

Expected: FAIL because `test-mcp-bridge.ts` does not exist.

- [ ] **Step 3: Implement MCP config builder**

Create `src/main/test-mcp-bridge.ts`:

```ts
import { randomUUID } from 'node:crypto'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { join } from 'node:path'
import { app } from 'electron'
import type { BrowserWindow } from 'electron'
import type { McpServerStdioConfig } from './providers/types'
import {
  createReportFindingTool,
  createReportGoalsTool,
  createSavePlaywrightTestTool,
} from './test-tools'

type TestingMcpConfigInput = {
  explorationId?: string
  cwd: string
  e2eOutputPath?: string
  callbackUrl: string
  callbackToken: string
}

export function createTestingToolCallbackUrl(port: number): string {
  return `http://127.0.0.1:${port}/tool`
}

function resolveTestingMcpServerPath(): string {
  if (app.isPackaged) return join(process.resourcesPath, 'app.asar.unpacked', 'out', 'main', 'test-mcp-stdio-server.js')
  return join(app.getAppPath(), 'out', 'main', 'test-mcp-stdio-server.js')
}

export function buildTestingMcpServers(input: TestingMcpConfigInput): Record<string, McpServerStdioConfig> {
  return {
    playwright: {
      command: 'bunx',
      args: ['@playwright/mcp@latest', '--headless'],
    },
    'pylon-testing': {
      command: process.execPath,
      args: [resolveTestingMcpServerPath()],
      env: {
        PYLON_TEST_CALLBACK_URL: input.callbackUrl,
        PYLON_TEST_CALLBACK_TOKEN: input.callbackToken,
        PYLON_TEST_EXPLORATION_ID: input.explorationId ?? '',
        PYLON_TEST_CWD: input.cwd,
        PYLON_TEST_E2E_OUTPUT_PATH: input.e2eOutputPath ?? '',
      },
    },
  }
}
```

Add a callback server class in the same file that receives JSON tool calls from the stdio server and executes existing `test-tools` in the main process with the `BrowserWindow`. The class should expose `start()`, `registerExploration()`, `unregisterExploration()`, and `stop()`; use `randomUUID()` for a callback token and reject requests without `Authorization: Bearer <token>`.

- [ ] **Step 4: Implement stdio MCP server**

Create `src/main/test-mcp-stdio-server.ts` using `@modelcontextprotocol/sdk/server/mcp.js` and `@modelcontextprotocol/sdk/server/stdio.js`. Register three tools:

- `report_finding`
- `save_playwright_test`
- `report_goals`

Each handler posts `{ toolName, args }` as JSON to `process.env.PYLON_TEST_CALLBACK_URL` with bearer token `PYLON_TEST_CALLBACK_TOKEN`, then returns the MCP content from the response.

The handler shape:

```ts
async function callParent(toolName: string, args: Record<string, unknown>) {
  const url = process.env.PYLON_TEST_CALLBACK_URL
  const token = process.env.PYLON_TEST_CALLBACK_TOKEN
  if (!url || !token) throw new Error('Pylon testing callback is not configured')

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ toolName, args }),
  })
  if (!response.ok) throw new Error(`Pylon testing callback failed: ${response.status}`)
  return response.json()
}
```

- [ ] **Step 5: Ensure the server is built**

Check `electron.vite.config.ts`. If the main build only emits `index.ts`, add `src/main/test-mcp-stdio-server.ts` as an additional Rollup input so `out/main/test-mcp-stdio-server.js` exists after `bun run build`.

- [ ] **Step 6: Run bridge test and typecheck**

Run:

```bash
bun test src/main/__tests__/test-mcp-bridge.test.ts
bun run typecheck:node
```

Expected: PASS.

Commit:

```bash
git add src/main/test-mcp-bridge.ts src/main/test-mcp-stdio-server.ts src/main/__tests__/test-mcp-bridge.test.ts electron.vite.config.ts
git commit -m "feat(testing): add provider-neutral MCP bridge"
```

---

### Task 8: Testing Manager Provider Refactor

**Files:**
- Modify: `src/main/test-manager.ts`
- Modify: `src/main/__tests__/no-direct-anthropic-api.test.ts` only if error text needs to mention the new helper; do not weaken forbidden token checks.
- Add test: `src/main/__tests__/test-manager-provider.test.ts`

- [ ] **Step 1: Write failing direct-import guard**

Create `src/main/__tests__/test-manager-provider.test.ts`:

```ts
import { describe, expect, test } from 'bun:test'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

describe('test-manager provider integration', () => {
  test('does not import Claude SDK directly', async () => {
    const source = await readFile(join(import.meta.dir, '..', 'test-manager.ts'), 'utf8')
    expect(source).not.toContain("@anthropic-ai/claude-agent-sdk")
    expect(source).not.toContain('createSdkMcpServer')
    expect(source).not.toContain('query({')
  })
})
```

- [ ] **Step 2: Run the provider guard and verify it fails**

Run:

```bash
bun test src/main/__tests__/test-manager-provider.test.ts
```

Expected: FAIL because `test-manager.ts` imports and calls the Claude SDK directly.

- [ ] **Step 3: Extend TestManager config types**

In `test-manager.ts`, import:

```ts
import type { EffortLevel } from '../shared/types'
import { getProviderForModel } from './providers'
import type { McpServerStdioConfig } from './providers/types'
import { buildTestingMcpServers, testingToolCallbackServer } from './test-mcp-bridge'
```

Add defaults:

```ts
const DEFAULT_TEST_AGENT_MODEL = 'claude-opus-4-7'
const DEFAULT_TEST_AGENT_EFFORT: EffortLevel = 'high'
```

Add to `suggestGoals`, `startExploration`, `startBatch`, and `runExploration` configs:

```ts
agentModel?: string
agentEffort?: EffortLevel
```

- [ ] **Step 4: Replace goal suggestion Claude query**

Replace the `createSdkMcpServer` and `query` path in `suggestGoals` with provider execution:

```ts
const agentModel = args.agentModel ?? DEFAULT_TEST_AGENT_MODEL
const agentEffort = args.agentEffort ?? DEFAULT_TEST_AGENT_EFFORT
const provider = getProviderForModel(agentModel)
if (!provider) throw new Error(`No provider found for model: ${agentModel}`)
```

Use the testing callback server for `report_goals`. Build MCP servers with `buildTestingMcpServers({ cwd, callbackUrl, callbackToken })`, create a provider session, and consume normalized events until completion. Preserve timeout behavior using the same abort controller.

- [ ] **Step 5: Replace exploration Claude query**

In `runExploration`, create the provider session:

```ts
const agentModel = config.agentModel ?? DEFAULT_TEST_AGENT_MODEL
const agentEffort = config.agentEffort ?? DEFAULT_TEST_AGENT_EFFORT
const provider = getProviderForModel(agentModel)
if (!provider) throw new Error(`No provider found for model: ${agentModel}`)
const callback = await testingToolCallbackServer.registerExploration({
  explorationId,
  cwd: config.cwd,
  e2eOutputPath: config.e2eOutputPath,
  window: this.window,
})
const mcpServers: Record<string, McpServerStdioConfig> = buildTestingMcpServers({
  explorationId,
  cwd: config.cwd,
  e2eOutputPath: config.e2eOutputPath,
  callbackUrl: callback.url,
  callbackToken: callback.token,
})
const agentSession = provider.createSession({
  cwd: config.cwd,
  model: agentModel,
  effort: agentEffort,
  permissionMode: 'auto-approve',
  abortController,
  onPermissionRequest: async () => ({ behavior: 'allow' as const }),
  onQuestionRequest: async () => ({}),
  mcpServers,
})
```

Consume normalized events:

```ts
for await (const event of agentSession.send(prompt)) {
  if (event.type === 'text_delta') active.streamedText += event.text
  if (event.type === 'thinking_delta') accumulatedMessages.push({ type: 'thinking', text: event.text })
  if (event.type === 'tool_use') {
    accumulatedMessages.push({
      type: 'tool_use',
      id: event.toolId,
      name: event.toolName,
      input: (event.input as Record<string, unknown>) ?? {},
    })
  }
  if (event.type === 'tool_result') {
    accumulatedMessages.push({
      type: 'tool_result',
      toolUseId: event.toolId,
      content: event.output.slice(0, 2000),
    })
  }
  if (event.type === 'usage_update') {
    inputTokens += event.inputTokens ?? 0
    outputTokens += event.outputTokens ?? 0
  }
  if (event.type === 'error') throw new Error(event.message)
  flush on STREAM_THROTTLE_MS as before
}
```

Unregister callback state in `finally`.

- [ ] **Step 6: Preserve batch propagation**

When `startBatch` calls `runExploration`, pass:

```ts
agentModel: config.agentModel,
agentEffort: config.agentEffort,
```

- [ ] **Step 7: Run tests and commit**

Run:

```bash
bun test src/main/__tests__/test-manager-provider.test.ts
bun test src/main/__tests__/test-mcp-bridge.test.ts
bun run typecheck:node
```

Expected: PASS.

Commit:

```bash
git add src/main/test-manager.ts src/main/__tests__/test-manager-provider.test.ts
git commit -m "feat(testing): run explorations through providers"
```

---

### Task 9: Testing Picker UI and Store Persistence

**Files:**
- Modify: `src/renderer/src/store/test-store.ts`
- Modify: `src/renderer/src/components/test/SetupWizard.tsx`
- Test: `src/renderer/src/store/test-store-agent-settings.test.ts`

- [ ] **Step 1: Extend test store agent fields**

Modify `src/renderer/src/store/test-store.ts`:

```ts
import type { EffortLevel } from '../../../shared/types'
import type { ProviderId } from '../lib/provider-models'
```

Add state:

```ts
agentProvider: ProviderId
agentModel: string
agentEffort: EffortLevel
setAgentSelection: (provider: ProviderId, model: string, effort: EffortLevel) => void
```

Initial values:

```ts
agentProvider: 'claude' as ProviderId,
agentModel: 'claude-opus-4-7',
agentEffort: 'high' as EffortLevel,
```

Add action:

```ts
setAgentSelection: (agentProvider, agentModel, agentEffort) =>
  set({ agentProvider, agentModel, agentEffort }),
```

- [ ] **Step 2: Pass agent settings through store calls**

In `suggestGoals`:

```ts
const { agentModel, agentEffort } = get()
await window.api.suggestGoals(cwd, agentModel, agentEffort)
```

In `startBatch`:

```ts
agentModel: get().agentModel,
agentEffort: get().agentEffort,
```

In `startExploration`:

```ts
const exploration = await window.api.startExploration({
  cwd,
  ...config,
  agentModel: get().agentModel,
  agentEffort: get().agentEffort,
})
```

- [ ] **Step 3: Add picker to SetupWizard**

In `SetupWizard.tsx`, load provider models and settings using `normalizeProviderModels` and `resolveFeatureAgentSelection`. On selection change:

```ts
setAgentSelection(provider, model, effort)
window.api.updateSettings('testingAgentModel', model)
window.api.updateSettings('testingAgentEffort', effort)
```

Pass picker props into `Step3Config` and render an `Agent` section before `Agent count`:

```tsx
<section>
  <h3 className="mb-2 font-medium text-base-text text-sm">Agent</h3>
  <ProviderModelPicker
    provider={agentProvider}
    model={agentModel}
    effort={agentEffort}
    models={providerModels}
    onProviderChange={onAgentChange}
    onModelChange={(model, effort) => onAgentChange(providerForModel(model, providerModels) ?? agentProvider, model, effort)}
    onEffortChange={(effort) => onAgentChange(agentProvider, agentModel, effort)}
  />
</section>
```

- [ ] **Step 4: Run store test, web typecheck, and commit**

Run:

```bash
bun test src/renderer/src/store/test-store-agent-settings.test.ts
bun run typecheck:web
```

Expected: PASS.

Commit:

```bash
git add src/renderer/src/store/test-store.ts src/renderer/src/components/test/SetupWizard.tsx src/renderer/src/store/test-store-agent-settings.test.ts
git commit -m "feat(testing): add provider picker"
```

---

### Task 10: Copy Cleanup and PR Review Error Consistency

**Files:**
- Modify: `src/renderer/src/components/StatusBar.tsx`
- Modify: `src/renderer/src/components/pr-review/PrDetail.tsx`
- Modify: `src/renderer/src/components/pr-review/ReviewModal.tsx` only if shared utilities replace local defaults.
- Search all renderer/main source for user-visible Claude-only copy.

- [ ] **Step 1: Search remaining Claude-only copy**

Run:

```bash
rg -n "Claude Code Required|requires Claude Code|Explain with Claude|from Claude analysis|Plan mode active.*Claude|Analyzing with Claude Code|Claude CLI not found" src
```

Expected before edits: matches in setup card defaults, PR detail, AST, and status bar.

- [ ] **Step 2: Update status bar plan tooltip**

In `StatusBar.tsx`, change:

```tsx
<Tooltip content="Plan mode active - the agent will plan before execution" side="top">
```

Keep the label `Plan`.

- [ ] **Step 3: Update PR review setup error rendering**

In `PrDetail.tsx`, use `getProviderSetupError(error)` and render:

```tsx
{setupError ? setupError.title : 'Review Failed'}
```

Description:

```tsx
{setupError
  ? setupError.description
  : error}
```

- [ ] **Step 4: Re-run copy search**

Run:

```bash
rg -n "requires Claude Code|Explain with Claude|from Claude analysis|Plan mode active.*Claude|Analyzing with Claude Code|Claude CLI not found" src
```

Expected: no matches in provider-neutral features. Matches are allowed only in explicit Claude setup defaults or Claude plugin settings.

- [ ] **Step 5: Run web typecheck and commit**

Run:

```bash
bun run typecheck:web
```

Expected: PASS.

Commit:

```bash
git add src/renderer/src/components/StatusBar.tsx src/renderer/src/components/pr-review/PrDetail.tsx src/renderer/src/components/pr-review/ReviewModal.tsx
git commit -m "fix(ui): remove provider-neutral Claude copy"
```

---

### Task 11: Full Verification

**Files:**
- No new files. This task verifies the whole branch.

- [ ] **Step 1: Run lint**

Run:

```bash
bun run lint
```

Expected: PASS with no warnings.

- [ ] **Step 2: Run typecheck**

Run:

```bash
bun run typecheck
```

Expected: PASS.

- [ ] **Step 3: Run all tests**

Run:

```bash
bun test
```

Expected: PASS.

- [ ] **Step 4: Run production build if MCP server entry changed**

Run:

```bash
bun run build
test -f out/main/test-mcp-stdio-server.js
```

Expected: build PASS and `out/main/test-mcp-stdio-server.js` exists.

- [ ] **Step 5: Commit verification fixes**

If any verification command required code changes:

```bash
git add src docs/superpowers/plans/2026-05-16-codex-feature-parity.md
git commit -m "fix: complete codex feature parity verification"
```

If no code changes were required, do not create an empty commit.

---

## Self-Review

- Spec coverage: Testing and Code Explorer get feature-level provider pickers, provider-backed main-process execution, persisted settings, setup error cleanup, and verification.
- Provider boundary: AI calls move through `runProviderTextQuery` or provider sessions. Testing still gets MCP tools through a stdio bridge that both Claude and Codex can receive as MCP server config.
- Type consistency: feature setting names are `testingAgentModel`, `testingAgentEffort`, `astAgentModel`, and `astAgentEffort` across shared types, settings, renderer state, and IPC.
- Risk handling: Testing includes a dedicated MCP bridge task because direct in-process Claude SDK tools cannot be reused by Codex.

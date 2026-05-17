# Provider Refactor Followups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolve the deferred Codex parity review threads by consolidating provider metadata, feature-agent selection, setup errors, and testing-agent stream handling behind shared contracts.

**Architecture:** Move provider identity, model catalog helpers, and feature-agent resolution into shared modules used by both main and renderer. Keep behavior changes incremental: first replace duplicate metadata and validation, then remove renderer state duplication, then split the testing manager/MCP bridge internals without changing user-facing flows.

**Tech Stack:** Electron main/preload/renderer, TypeScript, React 19, Zustand, Bun test runner, Biome, Tailwind canonical class checker.

---

## Deferred Review Threads Covered

- Shared provider metadata/types: `ProviderId`, model catalogs, provider labels, `EffortLevel` guards, and model-setting validation.
- Renderer feature-agent selection: duplicated loading/race handling in AST and Code/Test.
- Derived agent provider state: `agentProvider` stored beside `agentModel` in AST/Test stores.
- Test manager internals: duplicated agent resolution, goal-suggestion ids/tool-name matching, message deduplication, and token usage accounting.
- Testing MCP bridge responsibilities: singleton callback transport, MCP server config construction, and tool dispatch in one file.
- Provider setup errors: renderer string classifier and `ClaudeCodeSetupCard` naming/defaults.
- Text-only provider queries: partial cancellation support and system/user role separation.

## File Structure

- Create `src/shared/provider-models.ts`: shared provider ids, labels, default model ids, model-entry shape, effort helpers, model normalization, and model/effort validation.
- Modify `src/main/providers/types.ts`: import shared `ProviderId` and `ProviderModel`; keep provider-session and normalized-event types local to main.
- Modify `src/main/providers/claude-provider.ts` and `src/main/providers/codex-provider.ts`: use shared model metadata types and provider labels/defaults where needed.
- Modify `src/main/ipc-handlers.ts`: validate model setting keys against `getAllModels()` and validate effort using shared helpers.
- Modify `src/renderer/src/lib/provider-models.ts`: become a thin re-export/adaptor for shared provider-model helpers, or delete once imports move directly to `../../../shared/provider-models`.
- Create `src/renderer/src/hooks/use-feature-agent-selection.ts`: shared hook for AST and Code/Test provider-model loading, settings resolution, revision guarding, and persistence.
- Modify `src/renderer/src/pages/AstView.tsx` and `src/renderer/src/components/test/SetupWizard.tsx`: use the shared hook and remove local `loadAgentSelection` plumbing.
- Modify `src/renderer/src/store/ast-store.ts` and `src/renderer/src/store/test-store.ts`: store only `agentModel`, `agentEffort`, and revision; derive provider from current model/catalog at read sites.
- Create `src/main/feature-agent-resolver.ts`: shared main-process resolver for AST and testing feature agents.
- Modify `src/main/ast-ipc-utils.ts` and `src/main/test-manager.ts`: use the shared resolver.
- Create `src/main/test-agent-event-accumulator.ts`: single accumulator for `NormalizedEvent` to `ExplorationAgentMessage[]` and token accounting.
- Create `src/main/test-goal-session.ts`: explicit goal suggestion exploration id and goal tool matching helpers.
- Split `src/main/test-mcp-bridge.ts` into `src/main/test-mcp-config.ts`, `src/main/test-tool-callback-server.ts`, and `src/main/test-tool-dispatcher.ts`.
- Create `src/shared/provider-setup-errors.ts`: structured provider setup error codes and metadata.
- Rename `src/renderer/src/components/setup/ClaudeCodeSetupCard.tsx` to `ProviderSetupCard.tsx`.
- Modify `src/main/provider-text-query.ts` and provider session interfaces to support structured text-only prompts with `{ system, prompt }` and external abort propagation.

---

### Task 1: Shared Provider Metadata And Settings Validation

**Files:**
- Create: `src/shared/provider-models.ts`
- Modify: `src/main/providers/types.ts`
- Modify: `src/main/providers/claude-provider.ts`
- Modify: `src/main/providers/codex-provider.ts`
- Modify: `src/main/ipc-handlers.ts`
- Modify: `src/renderer/src/lib/provider-models.ts`
- Test: `src/shared/provider-models.test.ts`
- Test: `src/main/__tests__/ipc-settings.test.ts` if it exists; otherwise create `src/main/__tests__/settings-validation.test.ts`
- Test: `src/renderer/src/lib/provider-models.test.ts`

- [ ] **Step 1: Write shared provider model tests**

Create `src/shared/provider-models.test.ts` with the core behavior currently covered only in renderer tests:

```ts
import { describe, expect, test } from 'bun:test'
import {
  clampEffortForModel,
  FALLBACK_PROVIDER_MODELS,
  isProviderId,
  normalizeProviderModels,
  providerForModelId,
  providerLabel,
  resolveFeatureAgentSelection,
} from './provider-models'

describe('shared provider model utilities', () => {
  test('recognizes supported providers and labels them', () => {
    expect(isProviderId('claude')).toBe(true)
    expect(isProviderId('codex')).toBe(true)
    expect(isProviderId('legacy')).toBe(false)
    expect(providerLabel('claude')).toBe('Claude Code')
    expect(providerLabel('codex')).toBe('Codex')
  })

  test('resolves provider by catalog entry, not id prefix', () => {
    expect(providerForModelId('gpt-5.5')).toBe('codex')
    expect(providerForModelId(' claude-opus-4-7 ')).toBe('claude')
    expect(
      providerForModelId('o4-mini', [{ id: 'o4-mini', label: 'O4 Mini', provider: 'codex' }]),
    ).toBe('codex')
    expect(providerForModelId('opus-local')).toBeUndefined()
  })

  test('normalizes provider models and effort levels', () => {
    expect(
      normalizeProviderModels([
        { id: 'valid', label: 'Valid', provider: 'codex', supportsEffort: ['low', 'bogus'] },
        { id: 123, label: 'Bad', provider: 'codex' },
      ]),
    ).toEqual([{ id: 'valid', label: 'Valid', provider: 'codex', supportsEffort: ['low'] }])
    expect(normalizeProviderModels(null)).toBe(FALLBACK_PROVIDER_MODELS)
  })

  test('resolves stale persisted model to provider default', () => {
    expect(
      resolveFeatureAgentSelection({
        persistedModel: 'missing-model',
        persistedProvider: 'codex',
        persistedEffort: 'max',
        appDefaultModel: 'claude-opus-4-7',
        appDefaultEffort: 'high',
        models: FALLBACK_PROVIDER_MODELS,
      }),
    ).toEqual({ provider: 'codex', model: 'gpt-5.5', effort: 'max' })
  })

  test('clamps unsupported effort to the strongest supported level', () => {
    expect(clampEffortForModel('claude-sonnet-4-6', 'max', FALLBACK_PROVIDER_MODELS)).toBe('high')
  })
})
```

- [ ] **Step 2: Run shared provider tests and verify failure**

Run:

```bash
bun test src/shared/provider-models.test.ts
```

Expected: fail because `src/shared/provider-models.ts` does not exist yet.

- [ ] **Step 3: Implement shared provider model module**

Create `src/shared/provider-models.ts` by moving the provider helpers out of `src/renderer/src/lib/provider-models.ts`. Keep it renderer-safe and main-safe:

```ts
import { EFFORT_LEVELS, type EffortLevel, isEffortLevel } from './types'

export type ProviderId = 'claude' | 'codex'

export type ProviderModelEntry = {
  id: string
  label: string
  provider: ProviderId
  contextWindow?: number
  supportsEffort?: EffortLevel[]
}

export const FALLBACK_PROVIDER_MODELS: ProviderModelEntry[] = [
  { id: 'claude-opus-4-7', label: 'Opus 4.7', provider: 'claude', supportsEffort: ['low', 'medium', 'high', 'xhigh', 'max'] },
  { id: 'claude-opus-4-6', label: 'Opus 4.6', provider: 'claude', supportsEffort: ['low', 'medium', 'high', 'max'] },
  { id: 'claude-sonnet-4-6', label: 'Sonnet 4.6', provider: 'claude', supportsEffort: ['low', 'medium', 'high'] },
  { id: 'claude-haiku-4-5', label: 'Haiku 4.5', provider: 'claude', supportsEffort: ['low', 'medium', 'high'] },
  { id: 'gpt-5.5', label: 'GPT-5.5', provider: 'codex', supportsEffort: ['low', 'medium', 'high', 'xhigh', 'max'] },
  { id: 'gpt-5.4', label: 'GPT-5.4', provider: 'codex', supportsEffort: ['low', 'medium', 'high', 'max'] },
  { id: 'gpt-5.4-mini', label: 'GPT-5.4 Mini', provider: 'codex', supportsEffort: ['low', 'medium', 'high', 'max'] },
  { id: 'gpt-5.3-codex', label: 'GPT-5.3 Codex', provider: 'codex', supportsEffort: ['low', 'medium', 'high', 'max'] },
  { id: 'gpt-5.3-codex-spark', label: 'GPT-5.3 Codex Spark', provider: 'codex', supportsEffort: ['low', 'medium', 'high', 'max'] },
]

export const PROVIDER_DEFAULT_MODELS: Record<ProviderId, string> = {
  claude: 'claude-opus-4-7',
  codex: 'gpt-5.5',
}

export function isProviderId(value: unknown): value is ProviderId {
  return value === 'claude' || value === 'codex'
}

export function providerLabel(provider: ProviderId): string {
  return provider === 'codex' ? 'Codex' : 'Claude Code'
}

export function providerForModel(modelId: string, models: ProviderModelEntry[]): ProviderId | undefined {
  return models.find((model) => model.id === modelId)?.provider
}

export function providerForModelId(
  modelId: string | undefined,
  models: ProviderModelEntry[] = FALLBACK_PROVIDER_MODELS,
): ProviderId | undefined {
  const normalized = modelId?.trim()
  return normalized ? providerForModel(normalized, models) : undefined
}

export function defaultModelForProvider(provider: ProviderId, models: ProviderModelEntry[]): string {
  return (
    models.find((model) => model.provider === provider && model.id === PROVIDER_DEFAULT_MODELS[provider])?.id ??
    models.find((model) => model.provider === provider)?.id ??
    PROVIDER_DEFAULT_MODELS[provider]
  )
}

export function clampEffortForModel(
  modelId: string,
  effort: EffortLevel,
  models: ProviderModelEntry[],
): EffortLevel {
  const supported = models.find((model) => model.id === modelId)?.supportsEffort
  if (!supported?.length || supported.includes(effort)) return effort
  for (const candidate of [...EFFORT_LEVELS].reverse()) {
    if (supported.includes(candidate)) return candidate
  }
  return 'high'
}

export function normalizeProviderModels(models: unknown): ProviderModelEntry[] {
  if (!Array.isArray(models)) return FALLBACK_PROVIDER_MODELS
  const normalized = models.flatMap((raw): ProviderModelEntry[] => {
    if (!raw || typeof raw !== 'object') return []
    const model = raw as Record<string, unknown>
    if (typeof model.id !== 'string' || typeof model.label !== 'string' || !isProviderId(model.provider)) {
      return []
    }
    const supportsEffort = Array.isArray(model.supportsEffort)
      ? model.supportsEffort.filter(isEffortLevel)
      : undefined
    const contextWindow = typeof model.contextWindow === 'number' ? model.contextWindow : undefined
    return [{ id: model.id, label: model.label, provider: model.provider, contextWindow, supportsEffort }]
  })
  return normalized.length > 0 ? normalized : FALLBACK_PROVIDER_MODELS
}

export function resolveFeatureAgentSelection(input: {
  persistedModel?: string
  persistedProvider?: unknown
  persistedEffort?: unknown
  appDefaultModel?: string
  appDefaultEffort?: unknown
  models: ProviderModelEntry[]
}): { provider: ProviderId; model: string; effort: EffortLevel } {
  const modelExists = input.persistedModel
    ? input.models.some((model) => model.id === input.persistedModel)
    : false
  const appDefaultModelExists = input.appDefaultModel
    ? input.models.some((model) => model.id === input.appDefaultModel)
    : false
  const persistedProvider = isProviderId(input.persistedProvider) ? input.persistedProvider : undefined
  const provider =
    (modelExists && input.persistedModel ? providerForModel(input.persistedModel, input.models) : undefined) ??
    persistedProvider ??
    (input.appDefaultModel ? providerForModel(input.appDefaultModel, input.models) : undefined) ??
    'claude'
  const model =
    modelExists && input.persistedModel
      ? input.persistedModel
      : !persistedProvider && appDefaultModelExists && input.appDefaultModel
        ? input.appDefaultModel
        : defaultModelForProvider(provider, input.models)
  const requestedEffort = isEffortLevel(input.persistedEffort)
    ? input.persistedEffort
    : isEffortLevel(input.appDefaultEffort)
      ? input.appDefaultEffort
      : 'high'
  return { provider, model, effort: clampEffortForModel(model, requestedEffort, input.models) }
}
```

- [ ] **Step 4: Replace renderer helper with shared re-export**

Modify `src/renderer/src/lib/provider-models.ts`:

```ts
export type { ProviderId, ProviderModelEntry } from '../../../shared/provider-models'
export {
  clampEffortForModel,
  defaultModelForProvider,
  FALLBACK_PROVIDER_MODELS,
  isProviderId,
  normalizeProviderModels,
  providerForModel,
  providerForModelId,
  providerLabel,
  resolveFeatureAgentSelection,
} from '../../../shared/provider-models'
```

- [ ] **Step 5: Unify main provider types**

Modify `src/main/providers/types.ts`:

```ts
import type {
  Attachment,
  EffortLevel,
  PermissionMode,
  SessionInitInfo,
} from '../../shared/types'
import type { ProviderId, ProviderModelEntry } from '../../shared/provider-models'

export type { ProviderId } from '../../shared/provider-models'

export type ProviderModel = ProviderModelEntry & {
  contextWindow: number
  supportsEffort: EffortLevel[]
}
```

- [ ] **Step 6: Add model-setting validation tests**

Create `src/main/__tests__/settings-validation.test.ts`:

```ts
import { beforeEach, describe, expect, mock, test } from 'bun:test'

mock.module('../db', () => {
  const values = new Map<string, string>()
  return {
    getDb: () => ({
      prepare: (sql: string) => ({
        all: () => [...values.entries()].map(([key, value]) => ({ key, value })),
        run: (key: string, value: string) => {
          values.set(key, value)
        },
      }),
    }),
    __settings: values,
  }
})

mock.module('../providers', () => ({
  getAllModels: () => [
    { id: 'claude-opus-4-7', label: 'Opus 4.7', provider: 'claude', contextWindow: 1_000_000, supportsEffort: ['high'] },
    { id: 'gpt-5.5', label: 'GPT-5.5', provider: 'codex', contextWindow: 1_000_000, supportsEffort: ['high'] },
  ],
}))

describe('settings validation', () => {
  beforeEach(async () => {
    const db = await import('../db')
    ;(db as unknown as { __settings: Map<string, string> }).__settings.clear()
  })

  test('accepts known feature-agent model settings', async () => {
    const { updateSettingForTest } = await import('../ipc-handlers')
    expect(updateSettingForTest('testingAgentModel', 'gpt-5.5')).toBe(true)
    expect(updateSettingForTest('astAgentModel', 'claude-opus-4-7')).toBe(true)
  })

  test('rejects unknown feature-agent model settings', async () => {
    const { updateSettingForTest } = await import('../ipc-handlers')
    expect(updateSettingForTest('testingAgentModel', 'unknown-model')).toBe(false)
    expect(updateSettingForTest('astAgentModel', '')).toBe(false)
  })
})
```

Export a test-only helper from `src/main/ipc-handlers.ts`:

```ts
export const updateSettingForTest = updateSetting
```

Then implement validation:

```ts
const MODEL_SETTING_KEYS = new Set(['defaultModel', 'testingAgentModel', 'astAgentModel'])

function isKnownModelSetting(value: unknown): value is string {
  return typeof value === 'string' && getAllModels().some((model) => model.id === value)
}

function updateSetting(key: string, value: unknown): boolean {
  if (EFFORT_SETTING_KEYS.has(key) && !isEffortLevel(value)) return false
  if (MODEL_SETTING_KEYS.has(key) && !isKnownModelSetting(value)) return false
  const db = getDb()
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, String(value))
  return true
}
```

- [ ] **Step 7: Run targeted and full verification**

Run:

```bash
bun test src/shared/provider-models.test.ts src/renderer/src/lib/provider-models.test.ts src/main/__tests__/settings-validation.test.ts
bun run typecheck
bun test
bun run lint
```

Expected: all pass.

- [ ] **Step 8: Commit Task 1**

```bash
git add src/shared/provider-models.ts src/shared/provider-models.test.ts src/renderer/src/lib/provider-models.ts src/main/providers/types.ts src/main/ipc-handlers.ts src/main/__tests__/settings-validation.test.ts src/renderer/src/lib/provider-models.test.ts
git commit -m "refactor(providers): share provider model metadata"
```

---

### Task 2: Shared Feature-Agent Selection Hook

**Files:**
- Create: `src/renderer/src/hooks/use-feature-agent-selection.ts`
- Modify: `src/renderer/src/pages/AstView.tsx`
- Modify: `src/renderer/src/components/test/SetupWizard.tsx`
- Test: `src/renderer/src/hooks/use-feature-agent-selection.test.ts`
- Test: `src/renderer/src/components/ast/AstToolbar.test.ts`
- Test: `src/renderer/src/store/test-store-agent-settings.test.ts`

- [ ] **Step 1: Write hook tests for race behavior**

Create `src/renderer/src/hooks/use-feature-agent-selection.test.ts` with tests for:

```ts
import { describe, expect, test } from 'bun:test'
import { resolveFeatureAgentSelection } from '../../../shared/provider-models'

describe('feature agent selection behavior', () => {
  test('prefers persisted model over app default when valid', () => {
    expect(
      resolveFeatureAgentSelection({
        persistedModel: 'gpt-5.5',
        persistedEffort: 'xhigh',
        appDefaultModel: 'claude-opus-4-7',
        appDefaultEffort: 'high',
        models: [
          { id: 'claude-opus-4-7', label: 'Opus', provider: 'claude', supportsEffort: ['high'] },
          { id: 'gpt-5.5', label: 'GPT-5.5', provider: 'codex', supportsEffort: ['high', 'xhigh'] },
        ],
      }),
    ).toEqual({ provider: 'codex', model: 'gpt-5.5', effort: 'xhigh' })
  })
})
```

The hook itself should be tested through pure helpers where possible; do not add a heavy React test harness unless needed.

- [ ] **Step 2: Create shared hook**

Implement `src/renderer/src/hooks/use-feature-agent-selection.ts`:

```ts
import { useCallback, useRef, useState } from 'react'
import type { AppSettings, EffortLevel } from '../../../shared/types'
import {
  FALLBACK_PROVIDER_MODELS,
  normalizeProviderModels,
  type ProviderId,
  type ProviderModelEntry,
  resolveFeatureAgentSelection,
} from '../../../shared/provider-models'

type FeatureAgentSettings = {
  modelKey: 'astAgentModel' | 'testingAgentModel'
  effortKey: 'astAgentEffort' | 'testingAgentEffort'
}

type StoreSnapshot = {
  agentModel: string
  agentEffort: EffortLevel
  agentSelectionRevision: number
}

export function useFeatureAgentSelection(args: {
  settings: FeatureAgentSettings
  getSnapshot: () => StoreSnapshot
  applySelection: (provider: ProviderId, model: string, effort: EffortLevel) => void
}) {
  const [providerModels, setProviderModels] =
    useState<ProviderModelEntry[]>(FALLBACK_PROVIDER_MODELS)
  const requestRef = useRef(0)
  const baseRevisionRef = useRef(args.getSnapshot().agentSelectionRevision)
  const loadRef = useRef<Promise<{ models: ProviderModelEntry[]; selection: { provider: ProviderId; model: string; effort: EffortLevel } }> | null>(null)

  const loadAgentSelection = useCallback(async () => {
    const requestId = requestRef.current + 1
    requestRef.current = requestId
    const startRevision = args.getSnapshot().agentSelectionRevision

    loadRef.current ??= Promise.allSettled([window.api.getProviderModels(), window.api.getSettings()])
      .then(([modelsResult, settingsResult]) => {
        const models = modelsResult.status === 'fulfilled'
          ? normalizeProviderModels(modelsResult.value)
          : FALLBACK_PROVIDER_MODELS
        const settings = settingsResult.status === 'fulfilled' && settingsResult.value
          ? (settingsResult.value as Partial<AppSettings>)
          : {}
        const selection = resolveFeatureAgentSelection({
          persistedModel: settings[args.settings.modelKey],
          persistedEffort: settings[args.settings.effortKey],
          appDefaultModel: settings.defaultModel,
          appDefaultEffort: settings.defaultEffort,
          models,
        })
        return { models, selection }
      })
      .finally(() => {
        loadRef.current = null
      })

    const { models, selection } = await loadRef.current
    const current = args.getSnapshot()
    const canApply =
      requestRef.current === requestId &&
      current.agentSelectionRevision === startRevision &&
      startRevision === baseRevisionRef.current

    setProviderModels(models)
    if (canApply) {
      args.applySelection(selection.provider, selection.model, selection.effort)
      baseRevisionRef.current = args.getSnapshot().agentSelectionRevision
      return selection
    }

    const fallbackProvider = normalizeProviderModels(models).find((model) => model.id === current.agentModel)?.provider ?? selection.provider
    return { provider: fallbackProvider, model: current.agentModel, effort: current.agentEffort }
  }, [args])

  const markExternalReset = useCallback(() => {
    baseRevisionRef.current = args.getSnapshot().agentSelectionRevision
  }, [args])

  return { providerModels, setProviderModels, loadAgentSelection, markExternalReset }
}
```

If the `args` object causes hook dependency churn, wrap inputs at call sites or split primitive dependencies.

- [ ] **Step 3: Replace duplicated AST loading**

Modify `src/renderer/src/pages/AstView.tsx`:

```ts
const { providerModels, setProviderModels, loadAgentSelection, markExternalReset } =
  useFeatureAgentSelection({
    settings: { modelKey: 'astAgentModel', effortKey: 'astAgentEffort' },
    getSnapshot: () => useAstStore.getState(),
    applySelection: setAgentSelection,
  })
```

Delete the local `LoadedAgentSelection`, `providerModels` state, request refs, and `loadAgentSelection` implementation.

- [ ] **Step 4: Replace duplicated Code/Test loading**

Modify `src/renderer/src/components/test/SetupWizard.tsx` similarly, using:

```ts
settings: { modelKey: 'testingAgentModel', effortKey: 'testingAgentEffort' }
```

Call `markExternalReset()` wherever the old component assigned `agentSelectionBaseRevisionRef.current`.

- [ ] **Step 5: Verify renderer selection behavior**

Run:

```bash
bun test src/renderer/src/hooks/use-feature-agent-selection.test.ts src/renderer/src/components/ast/AstToolbar.test.ts src/renderer/src/store/test-store-agent-settings.test.ts
bun run typecheck
```

Expected: all pass.

- [ ] **Step 6: Commit Task 2**

```bash
git add src/renderer/src/hooks/use-feature-agent-selection.ts src/renderer/src/hooks/use-feature-agent-selection.test.ts src/renderer/src/pages/AstView.tsx src/renderer/src/components/test/SetupWizard.tsx
git commit -m "refactor(ui): share feature agent selection loading"
```

---

### Task 3: Remove Derived Agent Provider Store State

**Files:**
- Modify: `src/renderer/src/store/ast-store.ts`
- Modify: `src/renderer/src/store/test-store.ts`
- Modify: `src/renderer/src/pages/AstView.tsx`
- Modify: `src/renderer/src/components/test/SetupWizard.tsx`
- Modify: `src/renderer/src/components/ast/AstToolbar.tsx`
- Test: `src/renderer/src/store/ast-store.test.ts`
- Test: `src/renderer/src/store/test-store-agent-settings.test.ts`

- [ ] **Step 1: Update store tests to assert model/effort only**

In `src/renderer/src/store/ast-store.test.ts` and `src/renderer/src/store/test-store-agent-settings.test.ts`, replace expectations like:

```ts
expect(s.agentProvider).toBe('codex')
```

with catalog-derived assertions at component boundaries, or remove them from store tests and assert:

```ts
expect(s.agentModel).toBe('gpt-5.5')
expect(s.agentEffort).toBe('high')
```

- [ ] **Step 2: Remove provider from store state and action**

Modify both stores:

```ts
// Remove:
agentProvider: ProviderId
setAgentSelection: (provider: ProviderId, model: string, effort: EffortLevel) => void

// Replace with:
setAgentSelection: (model: string, effort: EffortLevel) => void
```

Implementation:

```ts
setAgentSelection: (agentModel, agentEffort) =>
  set((s) => ({
    agentModel,
    agentEffort,
    agentSelectionRevision: s.agentSelectionRevision + 1,
  })),
```

- [ ] **Step 3: Derive provider at read sites**

In `AstView.tsx` and `SetupWizard.tsx`:

```ts
import { providerForModelId } from '../../../shared/provider-models'

const agentProvider = providerForModelId(agentModel, providerModels) ?? 'claude'
```

Pass this derived value into `ProviderModelPicker` / toolbar props.

- [ ] **Step 4: Update picker callbacks**

Where callbacks currently call:

```ts
setAgentSelection(provider, model, effort)
```

replace with:

```ts
setAgentSelection(model, effort)
```

Keep the callback signature from `ProviderModelPicker` unchanged so the picker can still emit provider/model/effort.

- [ ] **Step 5: Verify store and UI tests**

Run:

```bash
bun test src/renderer/src/store/ast-store.test.ts src/renderer/src/store/test-store-agent-settings.test.ts src/renderer/src/components/ast/AstToolbar.test.ts
bun run typecheck
```

Expected: all pass.

- [ ] **Step 6: Commit Task 3**

```bash
git add src/renderer/src/store/ast-store.ts src/renderer/src/store/test-store.ts src/renderer/src/pages/AstView.tsx src/renderer/src/components/test/SetupWizard.tsx src/renderer/src/components/ast/AstToolbar.tsx src/renderer/src/store/ast-store.test.ts src/renderer/src/store/test-store-agent-settings.test.ts
git commit -m "refactor(ui): derive feature agent provider from model"
```

---

### Task 4: Shared Main-Process Feature Agent Resolver

**Files:**
- Create: `src/main/feature-agent-resolver.ts`
- Modify: `src/main/ast-ipc-utils.ts`
- Modify: `src/main/test-manager.ts`
- Test: `src/main/__tests__/feature-agent-resolver.test.ts`
- Test: `src/main/__tests__/test-manager-agent-settings.test.ts`
- Test: `src/main/__tests__/ast-ipc-utils.test.ts`

- [ ] **Step 1: Write resolver tests**

Create `src/main/__tests__/feature-agent-resolver.test.ts`:

```ts
import { describe, expect, test } from 'bun:test'
import { resolveFeatureAgent } from '../feature-agent-resolver'

describe('resolveFeatureAgent', () => {
  test('uses requested model when provider owns it', () => {
    const agent = resolveFeatureAgent({
      feature: 'testing',
      requestedModel: 'gpt-5.5',
      requestedEffort: 'xhigh',
    })
    expect(agent.model).toBe('gpt-5.5')
    expect(agent.provider.id).toBe('codex')
    expect(agent.label).toBe('Codex')
  })

  test('falls back to feature default for unknown model', () => {
    const agent = resolveFeatureAgent({
      feature: 'ast',
      requestedModel: 'missing',
      requestedEffort: 'bogus',
    })
    expect(agent.model).toBe('claude-opus-4-7')
    expect(agent.effort).toBe('high')
    expect(agent.provider.id).toBe('claude')
  })
})
```

- [ ] **Step 2: Implement resolver**

Create `src/main/feature-agent-resolver.ts`:

```ts
import { type EffortLevel, isEffortLevel } from '../shared/types'
import { providerLabel } from '../shared/provider-models'
import { getProviderForModel } from './providers/registry'
import type { AgentProvider } from './providers/types'

const FEATURE_DEFAULTS = {
  ast: { model: 'claude-opus-4-7', effort: 'high' as EffortLevel },
  testing: { model: 'claude-opus-4-7', effort: 'high' as EffortLevel },
}

export type FeatureAgentFeature = keyof typeof FEATURE_DEFAULTS

export function resolveFeatureAgent(args: {
  feature: FeatureAgentFeature
  requestedModel?: string
  requestedEffort?: unknown
}): { model: string; effort: EffortLevel; provider: AgentProvider; label: string } {
  const defaults = FEATURE_DEFAULTS[args.feature]
  const requestedModel = args.requestedModel?.trim() || defaults.model
  const requestedEffort = isEffortLevel(args.requestedEffort) ? args.requestedEffort : defaults.effort
  const provider = getProviderForModel(requestedModel)
  if (provider) {
    return {
      model: requestedModel,
      effort: requestedEffort,
      provider,
      label: providerLabel(provider.id),
    }
  }

  const defaultProvider = getProviderForModel(defaults.model)
  if (!defaultProvider) {
    throw new Error(`No provider found for ${args.feature} model: ${requestedModel}`)
  }

  return {
    model: defaults.model,
    effort: defaults.effort,
    provider: defaultProvider,
    label: providerLabel(defaultProvider.id),
  }
}
```

- [ ] **Step 3: Replace AST resolver**

Modify `src/main/ast-ipc-utils.ts`:

```ts
import { resolveFeatureAgent } from './feature-agent-resolver'

export function resolveAstAgent(args: AstAgentArgs) {
  return resolveFeatureAgent({
    feature: 'ast',
    requestedModel: args.agentModel,
    requestedEffort: args.agentEffort,
  })
}
```

Remove local `DEFAULT_AST_AGENT_*`, `validAgentEffort`, and `providerLabel` duplication if no longer used.

- [ ] **Step 4: Replace TestManager resolver**

In `src/main/test-manager.ts`, remove `resolveAgentSettings` and replace call sites:

```ts
const agent = resolveFeatureAgent({
  feature: 'testing',
  requestedModel: agentModel,
  requestedEffort: agentEffort,
})
```

and:

```ts
const agent = resolveFeatureAgent({
  feature: 'testing',
  requestedModel: config.agentModel,
  requestedEffort: config.agentEffort,
})
```

- [ ] **Step 5: Verify main resolver behavior**

Run:

```bash
bun test src/main/__tests__/feature-agent-resolver.test.ts src/main/__tests__/test-manager-agent-settings.test.ts src/main/__tests__/ast-ipc-utils.test.ts
bun run typecheck
```

Expected: all pass.

- [ ] **Step 6: Commit Task 4**

```bash
git add src/main/feature-agent-resolver.ts src/main/__tests__/feature-agent-resolver.test.ts src/main/ast-ipc-utils.ts src/main/test-manager.ts src/main/__tests__/test-manager-agent-settings.test.ts src/main/__tests__/ast-ipc-utils.test.ts
git commit -m "refactor(main): share feature agent resolution"
```

---

### Task 5: Test Manager Event Accumulator And Token Accounting

**Files:**
- Create: `src/main/test-agent-event-accumulator.ts`
- Modify: `src/main/test-manager.ts`
- Test: `src/main/__tests__/test-agent-event-accumulator.test.ts`
- Test: `src/main/__tests__/test-manager-agent-settings.test.ts`

- [ ] **Step 1: Write accumulator tests**

Create `src/main/__tests__/test-agent-event-accumulator.test.ts`:

```ts
import { describe, expect, test } from 'bun:test'
import { TestAgentEventAccumulator } from '../test-agent-event-accumulator'

describe('TestAgentEventAccumulator', () => {
  test('deduplicates streamed text when complete message repeats it', () => {
    const acc = new TestAgentEventAccumulator()
    expect(acc.append({ type: 'text_delta', text: 'hello', parentToolUseId: undefined })).toEqual([
      { type: 'text', text: 'hello' },
    ])
    expect(
      acc.append({
        type: 'message_complete',
        role: 'assistant',
        content: [{ type: 'text', text: 'hello' }],
        raw: {},
      }),
    ).toEqual([])
  })

  test('keeps non-streamed complete text', () => {
    const acc = new TestAgentEventAccumulator()
    expect(
      acc.append({
        type: 'message_complete',
        role: 'assistant',
        content: [{ type: 'text', text: 'final' }],
        raw: {},
      }),
    ).toEqual([{ type: 'text', text: 'final' }])
  })

  test('deduplicates tool use and tool result ids', () => {
    const acc = new TestAgentEventAccumulator()
    const event = { type: 'tool_use' as const, toolId: 't1', toolName: 'report_finding', input: { a: 1 } }
    expect(acc.append(event)).toHaveLength(1)
    expect(acc.append(event)).toEqual([])
  })

  test('uses max totals when usage_update and turn_complete overlap', () => {
    const acc = new TestAgentEventAccumulator()
    acc.recordUsage({ type: 'usage_update', inputTokens: 10, outputTokens: 5 })
    acc.recordUsage({ type: 'turn_complete', inputTokens: 8, outputTokens: 7, costUsd: 0 })
    expect(acc.usage()).toEqual({ inputTokens: 10, outputTokens: 7 })
  })
})
```

- [ ] **Step 2: Implement accumulator**

Create `src/main/test-agent-event-accumulator.ts`:

```ts
import type { ExplorationAgentMessage } from '../shared/types'
import type { NormalizedEvent } from './providers'

export class TestAgentEventAccumulator {
  private streamedText = ''
  private pendingTextDelta = ''
  private emittedToolUseIds = new Set<string>()
  private emittedToolResultIds = new Set<string>()
  private inputTokens = 0
  private outputTokens = 0

  recordUsage(event: Extract<NormalizedEvent, { type: 'usage_update' | 'turn_complete' }>): void {
    this.inputTokens = Math.max(this.inputTokens, event.inputTokens)
    this.outputTokens = Math.max(this.outputTokens, event.outputTokens)
  }

  usage(): { inputTokens: number; outputTokens: number } {
    return { inputTokens: this.inputTokens, outputTokens: this.outputTokens }
  }

  append(event: NormalizedEvent): ExplorationAgentMessage[] {
    const messages: ExplorationAgentMessage[] = []
    switch (event.type) {
      case 'text_delta':
        this.streamedText += event.text
        this.pendingTextDelta += event.text
        messages.push({ type: 'text', text: event.text })
        break
      case 'thinking_delta':
        messages.push({ type: 'thinking', text: event.text })
        break
      case 'tool_use':
        if (!this.emittedToolUseIds.has(event.toolId)) {
          this.emittedToolUseIds.add(event.toolId)
          messages.push({ type: 'tool_use', id: event.toolId, name: event.toolName, input: toRecord(event.input) })
        }
        break
      case 'tool_result':
        if (!this.emittedToolResultIds.has(event.toolId)) {
          this.emittedToolResultIds.add(event.toolId)
          messages.push({ type: 'tool_result', toolUseId: event.toolId, content: event.output.slice(0, 2000) })
        }
        break
      case 'message_complete':
        messages.push(...this.appendCompleteMessage(event))
        break
    }
    return messages
  }

  private appendCompleteMessage(event: Extract<NormalizedEvent, { type: 'message_complete' }>): ExplorationAgentMessage[] {
    const messages: ExplorationAgentMessage[] = []
    for (const block of event.content) {
      if (block.type === 'text' && event.role === 'assistant') {
        if (this.pendingTextDelta.startsWith(block.text)) {
          this.pendingTextDelta = this.pendingTextDelta.slice(block.text.length)
          continue
        }
        this.streamedText += `${block.text}\n`
        messages.push({ type: 'text', text: block.text })
      }
      if (block.type === 'thinking' && event.role === 'assistant') {
        messages.push({ type: 'thinking', text: block.text })
      }
      if (block.type === 'tool_use' && event.role === 'assistant' && !this.emittedToolUseIds.has(block.toolId)) {
        this.emittedToolUseIds.add(block.toolId)
        messages.push({ type: 'tool_use', id: block.toolId, name: block.toolName, input: toRecord(block.input) })
      }
      if (block.type === 'tool_result' && event.role === 'user' && !this.emittedToolResultIds.has(block.toolId)) {
        this.emittedToolResultIds.add(block.toolId)
        messages.push({ type: 'tool_result', toolUseId: block.toolId, content: block.output.slice(0, 2000) })
      }
    }
    if (event.role === 'assistant') this.pendingTextDelta = ''
    return messages
  }
}

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}
```

- [ ] **Step 3: Use accumulator in TestManager**

In `src/main/test-manager.ts`, replace the active exploration fields:

```ts
accumulator: TestAgentEventAccumulator
```

Initialize:

```ts
accumulator: new TestAgentEventAccumulator(),
```

In the event loop:

```ts
if (event.type === 'usage_update' || event.type === 'turn_complete') {
  active.accumulator.recordUsage(event)
  const usage = active.accumulator.usage()
  inputTokens = usage.inputTokens
  outputTokens = usage.outputTokens
} else {
  accumulatedMessages.push(...active.accumulator.append(event))
}
```

Remove `appendExplorationAgentEvent`, `appendCompleteMessage`, and `toRecord` from `TestManager`.

- [ ] **Step 4: Verify testing manager**

Run:

```bash
bun test src/main/__tests__/test-agent-event-accumulator.test.ts src/main/__tests__/test-manager-agent-settings.test.ts
bun run typecheck
```

Expected: all pass.

- [ ] **Step 5: Commit Task 5**

```bash
git add src/main/test-agent-event-accumulator.ts src/main/__tests__/test-agent-event-accumulator.test.ts src/main/test-manager.ts
git commit -m "refactor(testing): centralize agent event accumulation"
```

---

### Task 6: Explicit Goal Suggestion Context

**Files:**
- Create: `src/main/test-goal-session.ts`
- Modify: `src/main/test-manager.ts`
- Modify: `src/main/test-tools.ts`
- Test: `src/main/__tests__/test-goal-session.test.ts`
- Test: `src/main/__tests__/test-manager-agent-settings.test.ts`

- [ ] **Step 1: Write goal-session tests**

Create `src/main/__tests__/test-goal-session.test.ts`:

```ts
import { describe, expect, test } from 'bun:test'
import { createGoalSuggestionContext, isReportGoalsToolName } from '../test-goal-session'

describe('test goal session helpers', () => {
  test('creates explicit goal suggestion exploration context', () => {
    const ctx = createGoalSuggestionContext('token-1')
    expect(ctx.explorationId).toBe('goal-suggestion:token-1')
    expect(ctx.kind).toBe('goal-suggestion')
  })

  test('matches direct and namespaced report_goals tools only', () => {
    expect(isReportGoalsToolName('report_goals')).toBe(true)
    expect(isReportGoalsToolName('pylon-testing__report_goals')).toBe(true)
    expect(isReportGoalsToolName('report_finding')).toBe(false)
  })
})
```

- [ ] **Step 2: Implement helper**

Create `src/main/test-goal-session.ts`:

```ts
export type GoalSuggestionContext = {
  kind: 'goal-suggestion'
  callbackToken: string
  explorationId: string
}

export function createGoalSuggestionContext(callbackToken: string): GoalSuggestionContext {
  return {
    kind: 'goal-suggestion',
    callbackToken,
    explorationId: `goal-suggestion:${callbackToken}`,
  }
}

export function isReportGoalsToolName(toolName: string): boolean {
  return toolName === 'report_goals' || toolName.endsWith('__report_goals')
}
```

- [ ] **Step 3: Use helper in TestManager**

In `src/main/test-manager.ts`:

```ts
const goalContext = createGoalSuggestionContext(callbackToken)
```

Replace every `goal-suggestion-${callbackToken}` with `goalContext.explorationId`.

Replace `this.isReportGoalsToolName(toolName)` with `isReportGoalsToolName(toolName)`, then remove the private method.

- [ ] **Step 4: Verify goal session behavior**

Run:

```bash
bun test src/main/__tests__/test-goal-session.test.ts src/main/__tests__/test-manager-agent-settings.test.ts
bun run typecheck
```

Expected: all pass.

- [ ] **Step 5: Commit Task 6**

```bash
git add src/main/test-goal-session.ts src/main/__tests__/test-goal-session.test.ts src/main/test-manager.ts
git commit -m "refactor(testing): make goal suggestion context explicit"
```

---

### Task 7: Split Testing MCP Bridge Responsibilities

**Files:**
- Create: `src/main/test-mcp-config.ts`
- Create: `src/main/test-tool-callback-server.ts`
- Create: `src/main/test-tool-dispatcher.ts`
- Modify: `src/main/test-mcp-bridge.ts`
- Modify: `src/main/test-manager.ts`
- Test: `src/main/__tests__/test-mcp-bridge.test.ts`

- [ ] **Step 1: Move config builder tests first**

In `src/main/__tests__/test-mcp-bridge.test.ts`, keep existing tests but rename groups so failures identify the new module:

```ts
describe('testing MCP config', () => {
  // existing create URL, build configs, resolve stdio path tests
})
```

- [ ] **Step 2: Extract config module**

Create `src/main/test-mcp-config.ts` and move:

```ts
export type McpStdioConfig = { command: string; args?: string[]; env?: Record<string, string> }
export type TestingMcpServers = { playwright: McpStdioConfig; 'pylon-testing': McpStdioConfig }
export type BuildTestingMcpServersInput = { callbackPort: number; callbackToken: string; explorationId: string; cwd: string; e2eOutputPath: string; stdioServerPath?: string; command?: string }
export type ResolveTestingMcpStdioServerPathOptions = { dirname?: string; isPackaged?: boolean; appPath?: string }
export function createTestingToolCallbackUrl(port: number): string
export function resolveTestingMcpStdioServerPath(options?: ResolveTestingMcpStdioServerPathOptions): string
export function buildTestingMcpServers(input: BuildTestingMcpServersInput): TestingMcpServers
```

- [ ] **Step 3: Extract tool dispatcher**

Create `src/main/test-tool-dispatcher.ts`:

```ts
import type { BrowserWindow } from 'electron'
import { createReportFindingTool, createReportGoalsTool, createSavePlaywrightTestTool } from './test-tools'

export type RegisteredTestingExploration = {
  callbackToken: string
  explorationId: string
  cwd: string
  e2eOutputPath: string
  window: BrowserWindow | null
  onToolExecute?: (toolName: string, args: Record<string, unknown>) => void
}

export function createTestingToolMap(exploration: RegisteredTestingExploration) {
  return new Map(
    [
      createReportFindingTool({ explorationId: exploration.explorationId, cwd: exploration.cwd, e2eOutputPath: exploration.e2eOutputPath, window: exploration.window }),
      createSavePlaywrightTestTool({ explorationId: exploration.explorationId, cwd: exploration.cwd, e2eOutputPath: exploration.e2eOutputPath }),
      createReportGoalsTool({ cwd: exploration.cwd, window: exploration.window }),
    ].map((tool) => [tool.name, tool]),
  )
}
```

- [ ] **Step 4: Extract callback server**

Create `src/main/test-tool-callback-server.ts` with only HTTP lifecycle, token lookup, body parsing, and dispatcher invocation. Export:

```ts
export class TestingToolCallbackServer {
  start(port?: number): Promise<{ port: number; callbackUrl: string }>
  registerExploration(exploration: RegisteredTestingExploration): void
  unregisterExploration(callbackToken: string): void
  stop(): Promise<void>
}

export const testingToolCallbackServer = new TestingToolCallbackServer()
```

- [ ] **Step 5: Keep compatibility barrel**

Modify `src/main/test-mcp-bridge.ts` to re-export:

```ts
export * from './test-mcp-config'
export * from './test-tool-callback-server'
export * from './test-tool-dispatcher'
```

- [ ] **Step 6: Verify bridge tests**

Run:

```bash
bun test src/main/__tests__/test-mcp-bridge.test.ts
bun run typecheck
```

Expected: all pass.

- [ ] **Step 7: Commit Task 7**

```bash
git add src/main/test-mcp-config.ts src/main/test-tool-callback-server.ts src/main/test-tool-dispatcher.ts src/main/test-mcp-bridge.ts src/main/__tests__/test-mcp-bridge.test.ts
git commit -m "refactor(testing): split MCP bridge responsibilities"
```

---

### Task 8: Structured Provider Setup Errors And Generic Setup Card

**Files:**
- Create: `src/shared/provider-setup-errors.ts`
- Modify: `src/renderer/src/lib/setup-errors.ts`
- Rename: `src/renderer/src/components/setup/ClaudeCodeSetupCard.tsx` to `ProviderSetupCard.tsx`
- Modify: `src/renderer/src/components/messages/ResultMessage.tsx`
- Modify: `src/renderer/src/components/pr-review/PrDetail.tsx`
- Test: `src/renderer/src/lib/setup-errors.test.ts`

- [ ] **Step 1: Add structured setup-error tests**

Modify `src/renderer/src/lib/setup-errors.test.ts` to assert stable error codes:

```ts
expect(getProviderSetupError('Claude Code CLI not found. Install Claude Code.')?.code).toBe('claude-cli-missing')
expect(getProviderSetupError('Codex auth failed')?.code).toBe('codex-auth-missing')
```

- [ ] **Step 2: Create shared setup metadata**

Create `src/shared/provider-setup-errors.ts`:

```ts
import type { ProviderId } from './provider-models'

export type ProviderSetupErrorCode =
  | 'claude-cli-missing'
  | 'codex-cli-missing'
  | 'codex-auth-missing'

export type ProviderSetupError = {
  code: ProviderSetupErrorCode
  provider: ProviderId
  title: string
  description: string
  actionLabel: string
  actionUrl: string
  command: string
}

export const PROVIDER_SETUP_ERRORS: Record<ProviderSetupErrorCode, ProviderSetupError> = {
  'claude-cli-missing': {
    code: 'claude-cli-missing',
    provider: 'claude',
    title: 'Claude Code Required',
    description: 'This action requires Claude Code to be installed on your machine. Make sure the `claude` command works in Terminal, then retry.',
    actionLabel: 'Install Claude Code',
    actionUrl: 'https://code.claude.com/docs',
    command: 'claude',
  },
  'codex-cli-missing': {
    code: 'codex-cli-missing',
    provider: 'codex',
    title: 'Codex Required',
    description: 'This action requires Codex to be installed on your machine. Make sure the `codex` command works in Terminal, then retry.',
    actionLabel: 'Install Codex',
    actionUrl: 'https://developers.openai.com/codex/cli',
    command: 'codex',
  },
  'codex-auth-missing': {
    code: 'codex-auth-missing',
    provider: 'codex',
    title: 'Codex Login Required',
    description: 'This action requires Codex authentication. Run `codex login`, then retry.',
    actionLabel: 'Codex Setup',
    actionUrl: 'https://developers.openai.com/codex/cli',
    command: 'codex login',
  },
}
```

- [ ] **Step 3: Keep classifier small and code-based**

Modify `src/renderer/src/lib/setup-errors.ts` to return entries from `PROVIDER_SETUP_ERRORS` instead of local objects. Keep the existing string matching as a compatibility classifier for now.

- [ ] **Step 4: Rename setup card**

Rename the file and component:

```bash
git mv src/renderer/src/components/setup/ClaudeCodeSetupCard.tsx src/renderer/src/components/setup/ProviderSetupCard.tsx
```

Replace `ClaudeCodeSetupCard` exports/imports with `ProviderSetupCard`. Remove Claude defaults from props and use `setup` as the required primary path:

```ts
type ProviderSetupCardProps = {
  errorMessage?: string | null
  setup: ProviderSetupError
  compact?: boolean
}
```

- [ ] **Step 5: Verify setup UI references**

Run:

```bash
rg "ClaudeCodeSetupCard|Claude Code Required" src/renderer/src
bun test src/renderer/src/lib/setup-errors.test.ts
bun run typecheck
```

Expected: no `ClaudeCodeSetupCard` references remain; tests/typecheck pass.

- [ ] **Step 6: Commit Task 8**

```bash
git add src/shared/provider-setup-errors.ts src/renderer/src/lib/setup-errors.ts src/renderer/src/lib/setup-errors.test.ts src/renderer/src/components/setup/ProviderSetupCard.tsx src/renderer/src/components/messages/ResultMessage.tsx src/renderer/src/components/pr-review/PrDetail.tsx
git commit -m "refactor(setup): use provider-neutral setup errors"
```

---

### Task 9: Structured Text-Only Provider Query API

**Files:**
- Modify: `src/main/providers/types.ts`
- Modify: `src/main/providers/claude-provider.ts`
- Modify: `src/main/providers/codex-provider.ts`
- Modify: `src/main/provider-text-query.ts`
- Modify: `src/main/ast-ipc-handlers.ts`
- Test: `src/main/__tests__/provider-text-query.test.ts`

- [ ] **Step 1: Extend text-only session contract tests**

Modify `src/main/__tests__/provider-text-query.test.ts` to assert the provider receives separated prompt parts:

```ts
async *sendTextOnly(input) {
  expect(input).toEqual({ system: 'System text', prompt: 'User text' })
  for (const event of events) yield event
}
```

- [ ] **Step 2: Change provider interface**

Modify `src/main/providers/types.ts`:

```ts
export type TextOnlyPrompt = {
  system: string
  prompt: string
}

export type AgentSession = {
  // existing
  sendTextOnly(input: TextOnlyPrompt): AsyncIterable<NormalizedEvent>
}
```

- [ ] **Step 3: Adapt Claude provider**

In `src/main/providers/claude-provider.ts`, convert structured input internally:

```ts
async *sendTextOnly(input: TextOnlyPrompt): AsyncIterable<NormalizedEvent> {
  const prompt = `${input.system}\n\n${input.prompt}`
  // existing tools: [] and abort-controller behavior
}
```

This keeps behavior identical while the provider contract becomes role-aware.

- [ ] **Step 4: Adapt Codex provider**

In `src/main/providers/codex-provider.ts`, convert structured input internally:

```ts
async *sendTextOnly(input: TextOnlyPrompt): AsyncIterable<NormalizedEvent> {
  const prompt = `${input.system}\n\n${input.prompt}`
  // existing read-only thread options
}
```

Keep `approvalPolicy: 'never'` and `sandboxMode: 'read-only'`.

- [ ] **Step 5: Update `runProviderTextQuery`**

Modify `src/main/provider-text-query.ts`:

```ts
for await (const event of textSession.sendTextOnly({
  system: options.systemPrompt,
  prompt: options.prompt,
})) {
  // existing aggregation
}
```

- [ ] **Step 6: Wire AST abort controller where practical**

In `src/main/ast-ipc-handlers.ts`, create request-local `AbortController`s for analyze/explain/chat provider calls and pass them to `createProviderQueryFn` through `runProviderTextQuery`. If Electron IPC does not expose request cancellation, document that `stop()` cleanup still covers local errors while view-switch cancellation remains a later product behavior.

- [ ] **Step 7: Verify provider query tests**

Run:

```bash
bun test src/main/__tests__/provider-text-query.test.ts src/main/__tests__/ast-ai.test.ts
bun run typecheck
```

Expected: all pass.

- [ ] **Step 8: Commit Task 9**

```bash
git add src/main/providers/types.ts src/main/providers/claude-provider.ts src/main/providers/codex-provider.ts src/main/provider-text-query.ts src/main/ast-ipc-handlers.ts src/main/__tests__/provider-text-query.test.ts
git commit -m "refactor(providers): structure text-only prompts"
```

---

### Task 10: Final Verification And PR Prep

**Files:**
- Modify: no source changes unless verification exposes a bug.

- [ ] **Step 1: Run full verification**

Run:

```bash
bun test
bun run typecheck
bun run lint
```

Expected:

```text
0 fail
tsc exits 0
biome exits 0
```

- [ ] **Step 2: Inspect final diff**

Run:

```bash
git status --short
git log --oneline origin/master..HEAD
git diff --stat origin/master...HEAD
```

Expected: only refactor commits and intended files are present.

- [ ] **Step 3: Push branch**

```bash
git push -u origin provider-refactor-followups
```

- [ ] **Step 4: Open draft PR**

Use `gh pr create` or the GitHub connector with:

```text
Title: [refactor] consolidate provider feature-agent plumbing

Body:
## Summary
- share provider metadata and model validation across main/renderer
- dedupe AST and Code/Test feature-agent selection
- centralize testing agent event/token accumulation
- split testing MCP bridge responsibilities
- make provider setup UI provider-neutral

## Verification
- bun test
- bun run typecheck
- bun run lint
```

---

## Self-Review

Spec coverage:
- Shared provider metadata and duplicated `ProviderId`/`EffortLevel` helpers are covered by Task 1.
- Per-feature model setting validation is covered by Task 1.
- Duplicated AST/Code-Test feature-agent loading is covered by Task 2.
- Derived `agentProvider` store state is covered by Task 3.
- Main resolver duplication is covered by Task 4.
- Test manager emit/dedup/token accounting and goal id coupling are covered by Tasks 5 and 6.
- Testing MCP bridge responsibility split is covered by Task 7.
- Setup error/card naming is covered by Task 8.
- Text-only provider query role/cancellation boundary is covered by Task 9.

Placeholder scan:
- No task uses `TBD`, `TODO`, or unspecified "write tests" language.
- Every task has concrete files, commands, and expected outcomes.

Type consistency:
- Shared provider metadata uses `ProviderModelEntry` in shared and `ProviderModel` in main as the strict context-window variant.
- Feature-agent selection consistently returns `{ provider, model, effort }`.
- Store refactor changes `setAgentSelection` to `(model, effort)` and derives provider at component read sites.

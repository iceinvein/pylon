# Code Impact Explorer Design

## Context

The current Code feature is a top-level AST visualizer. It lets users choose a project, analyze it, view a repo graph, drill into a file AST, preview source, toggle dependency/call/dataflow overlays, and ask a small codebase chat panel questions.

Static review found that the feature has useful foundations but does not yet have a clear job:

- It is a standalone top-level mode, but most interactions stop at browsing rather than helping users decide what to do.
- The primary artifact is a graph, while the likely user question is "what breaks if I change this?"
- Some existing behaviors are incomplete:
  - "Explain with Claude Code" stores explanation text in state, but no UI renders it.
  - AST chat results can include highlights from the main process, but the renderer bridge drops them.
  - Repo analysis supports multiple languages, but file drill-down uses the TypeScript-only parser path.
  - Cached analysis loads quickly, but stale analysis is not clearly surfaced.
- The feature currently uses several overlapping selection concepts (`selectedFile`, `drilledFile`, `selectedNode`, `focusedNode`) that make it harder to reason about one user's current target.

The selected product direction is to keep Code as a standalone architecture map, with the first useful job being impact analysis. Code should answer: "what changes if I touch this file or symbol?"

## Goals

- Make Code a selection-centered impact explorer.
- Support file and symbol selection from search, explorer tree, graph, code panel, chat citations, and explanation results.
- Show deterministic impact first: importers, dependencies, reachable paths, and likely tests.
- Add best-effort symbol/reference/call information only with visible confidence and evidence.
- Repair existing broken flows as part of the redesign.
- Preserve and reuse the existing analyzer, parser, graph, cache, and UI foundations where practical.

## Non-Goals

- Do not build a full editable architecture documentation system in this pass.
- Do not promise perfect cross-language call graph precision.
- Do not add ownership/team metadata.
- Do not build saved/shareable diagrams before the core impact workflow proves useful.
- Do not fold Code into Sessions, PR Review, or Testing as the primary product direction.

## User Workflow

The redesigned workflow is:

1. User opens Code and selects a project.
2. Pylon analyzes or loads cached architecture data.
3. User selects a file or symbol from search, explorer tree, graph, code panel, or chat citation.
4. Code updates one canonical selected entity.
5. The center graph becomes an ego-network around that selected entity.
6. The right impact panel shows blast radius:
   - direct dependencies
   - direct importers/callers
   - likely affected paths
   - likely tests
   - confidence notes
   - actions
7. User can ask for an explanation. The answer renders in the impact panel and cites files/symbols.
8. Clicking any citation selects that entity and updates the graph, code panel, and impact panel.

The feature should feel like a decision tool, not a decorative graph.

## UX Structure

The Code screen should become a three-column working view:

- Left: project explorer and symbol search.
- Center: impact graph.
- Right: impact panel.

The top toolbar should include:

- project breadcrumb/switcher
- search entry
- analysis freshness state
- re-analyze action
- compact controls for graph overlays or filters

The left explorer should include:

- files grouped by directory/module
- symbols under files where available
- quick filters for files, symbols, routes, and tests
- search results that select entities, not only filenames

The center graph should include:

- selected entity as the visual anchor
- direct dependencies and reverse dependencies
- path expansion for reachable impact
- filters for imports, inferred calls/references, tests, and data paths
- clear visual distinction between deterministic and inferred edges

The right impact panel should include:

- selected entity identity and source location
- metrics for dependencies, importers/callers, likely tests, and affected paths
- grouped impact lists with clickable rows
- path explanations
- rendered explanation output
- confidence and stale-analysis notes
- actions:
  - explain impact
  - open source
  - find tests
  - copy context

## Data Model

Keep the existing `RepoGraph` as the source of deterministic file-level data:

- files
- declarations
- imports
- resolved import edges

Add an `ImpactIndex` derived from `RepoGraph` and parser output:

```ts
type CodeEntity =
  | { kind: 'file'; filePath: string }
  | { kind: 'symbol'; filePath: string; symbolId: string; symbolName: string; symbolType: AstNodeType; startLine: number; endLine: number }

type ImpactEdgeKind = 'import' | 'reverse-import' | 'reference' | 'call' | 'test'

type ImpactConfidence = 'high' | 'inferred' | 'unavailable'

type ImpactEdge = {
  kind: ImpactEdgeKind
  source: CodeEntity
  target: CodeEntity
  confidence: ImpactConfidence
  evidence?: string
}

type ImpactPath = {
  id: string
  label: string
  entities: CodeEntity[]
  confidence: ImpactConfidence
}

type ImpactSummary = {
  selected: CodeEntity
  dependencies: ImpactEdge[]
  importers: ImpactEdge[]
  references: ImpactEdge[]
  likelyTests: CodeEntity[]
  paths: ImpactPath[]
  notes: string[]
  generatedAt: number
  stale: boolean
}
```

Exact type names can change during implementation, but the model should preserve these concepts.

## Analysis Behavior

The first implementation should be deterministic where possible:

- Build reverse dependency maps from resolved import edges.
- Build dependency paths using bounded graph traversal.
- Detect likely tests by filename and directory conventions:
  - `.test.`
  - `.spec.`
  - `__tests__`
  - `test/`
  - `tests/`
- Map symbols to files using parsed declarations.
- For a file selection, show file-level impact.
- For a symbol selection, show symbol identity plus file-level impact immediately.

Symbol references and call edges can be added as best-effort:

- Use parser-level information when available.
- Use simple textual/reference heuristics only when they produce clear evidence.
- Label heuristic or AI-derived edges as `inferred`.
- Do not mix inferred and deterministic edges without visual distinction.

## IPC Design

Add explicit IPC APIs for impact data:

- `ast:get-impact-index`
- `ast:get-impact`
- `ast:search-entities`

Avoid recomputing full analysis on every click. The main process should cache the impact index with the analysis result.

Cached data should include enough freshness metadata to indicate staleness:

- generated timestamp
- file count
- file mtimes or a stable project snapshot hash

Persist the first version by adding `impact_index` and `snapshot_hash` fields to the existing `ast_analyses` persistence path. A separate table is unnecessary until impact data needs independent versioning or partial updates.

When a user re-analyzes, refresh these together:

- `RepoGraph`
- `ArchAnalysis`
- `ImpactIndex`
- freshness metadata

## Renderer State

Replace overlapping selection state with one canonical selected entity:

```ts
selectedEntity: CodeEntity | null
impactSummary: ImpactSummary | null
impactLoading: boolean
impactError: string | null
```

View-specific state can remain separate:

- graph pan/zoom
- expanded directories
- active overlays/filters
- search query
- chat messages
- panel expansion state

The graph, code panel, explorer, chat citations, and impact panel should all read/write the same selected entity.

## Required Behavior Fixes

### Render Explanations

The existing `explainText` and `explainLoading` state should become visible in the impact panel.

Behavior:

- Show loading on the selected entity.
- Attach the result to the entity it was requested for.
- If the user changes selection before completion, show the result as stale or keep it under the original entity rather than silently replacing the active panel.
- Show a useful error if Claude Code CLI is unavailable.

### Preserve Chat Highlights

The main process already parses highlights from chat responses. The renderer bridge should preserve them.

Behavior:

- Store highlights with assistant messages.
- Render highlights as citations.
- Clicking a citation selects the referenced file/symbol.
- If a cited symbol cannot be resolved, select the file and show an unresolved-symbol note.

### Use Multi-Language File AST

File drill-down should use the multi-language parser path, not only the TypeScript parser.

Behavior:

- Use the existing multi-language parser for file AST when supported.
- Show a clear unsupported-language state if parsing is unavailable.
- Keep source preview available even when AST parsing fails.

### Surface Cache Freshness

Cached analysis should not feel silently authoritative.

Behavior:

- Show when analysis was generated.
- Detect and show likely stale state when files changed since analysis.
- Re-analysis refreshes all derived Code data.

## Confidence and Error States

Impact data must distinguish confidence:

- `high`: deterministic import/reverse-import/path/test data.
- `inferred`: heuristic or AI-derived reference/call/dataflow data.
- `unavailable`: parser, CLI, index, or language support missing.

The UI should keep deterministic impact visible even when inferred data is unavailable.

Examples:

- Claude Code CLI missing: explanations unavailable, deterministic impact still works.
- Tree-sitter grammar missing: source preview and file-level import impact still work.
- Stale cache: show stale state and offer re-analysis; do not hide the existing result.
- Large repo truncated: show truncation note and avoid implying completeness.

## Testing Plan

Automated tests should cover:

- `ImpactIndex` builder:
  - reverse dependencies
  - dependency path traversal
  - likely test detection
  - stale metadata behavior
- Multi-language file AST:
  - TypeScript regression
  - at least one tree-sitter language regression
- AST store:
  - selected entity
  - impact loading/error/result state
  - reset behavior
- Bridge behavior:
  - explanation result rendering data reaches renderer state
  - chat highlights are preserved
- Layout helpers:
  - ego-network graph contains selected entity and expected neighbors

Manual or E2E verification should cover:

- Analyze the Pylon repo.
- Select a symbol and verify graph, impact panel, and code panel stay synced.
- Trigger explanation and verify it renders in the impact panel.
- Ask a chat question with citations and use a citation to jump to a file/symbol.
- Modify a file and verify stale cache state plus re-analysis refresh.

## Implementation Slices

### Slice 1: Repair Existing Code Mode

- Render explanation output.
- Preserve chat highlights.
- Switch file AST drill-down to multi-language parser.
- Add freshness cues for cached analysis.
- Add tests for these repaired behaviors.

### Slice 2: Add Impact Index

- Build reverse dependency and path analysis from existing `RepoGraph`.
- Add likely test detection.
- Add main-process IPC for impact queries.
- Persist/cache impact index with analysis metadata.
- Add focused analyzer tests.

### Slice 3: Unify Selection

- Introduce `selectedEntity`.
- Route explorer, graph, code panel, and chat citations through selected entity.
- Keep compatibility adapters during migration if needed.
- Add store tests.

### Slice 4: Build Impact Panel and Ego Graph

- Add right-side impact panel.
- Adapt graph layout to selected-entity ego network.
- Add deterministic/inferred visual distinction.
- Add loading, empty, stale, and unavailable states.

### Slice 5: Polish and Verify

- Refine keyboard and mouse interactions.
- Validate dense-layout behavior across common viewport sizes.
- Run typecheck and relevant unit tests.
- Manually verify the workflow on the Pylon repo.

## Deferred Decisions

- "Copy context" should copy a plain-text impact summary to the clipboard in this pass. Feeding selected context directly into Sessions can wait until the standalone impact flow is useful.

## Acceptance Criteria

- Code mode clearly answers what is affected by a selected file or symbol.
- The current broken explain and chat-highlight flows are repaired.
- File drill-down supports the same language set as repo analysis where practical.
- Deterministic and inferred impact data are visually distinct.
- Cached analysis freshness is visible.
- Tests cover the new analyzer, store, and bridge behavior.
- Manual verification confirms selection, graph, code, impact panel, explanation, and citations stay synchronized.

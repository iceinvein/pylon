# Multi-Language AST Support — Design Spec

> **Thesis:** Show the full dependency picture — internal code structure plus external package relationships — across any language.

## Overview

The v1 AST Visualizer only parses TS/JS/TSX/JSX files. This extension adds support for any language via web-tree-sitter (WASM-based), with Tier 1 grammars (Rust, Python, Go) bundled and all others downloaded on demand from a CDN and cached locally.

External package dependencies are displayed contextually — in the CodePanel when a file is selected, and as peripheral graph nodes only when the Dependencies overlay is active and scoped to the visible cluster. Manifest parsing is an optional phase that can ship after the core multi-language parsing.

No changes to the renderer, Zustand store, IPC channels, or graph components — all core work happens in the main process behind the existing `RepoGraph` interface. The only renderer change is adding a contextual dependencies section to the CodePanel.

## Parser Architecture

### Common Interface

New file `src/main/ast-parsers/types.ts`:

```typescript
type LanguageParser = {
  parseFile(filePath: string, content: string): ParsedFile
  resolveImport(specifier: string, fromFile: string, allFiles: Set<string>): string | null
}

type ParsedFile = {
  declarations: AstNode[]
  imports: Array<{ moduleSpecifier: string; specifiers: string[] }>
}
```

### Parser Registry

New file `src/main/ast-parsers/registry.ts`:

Maps file extensions to parser instances:
- `.ts/.tsx/.js/.jsx` → `ts-parser.ts` (extracted from current `ast-analyzer.ts`)
- `.rs` → tree-sitter with Rust grammar + Rust import resolver
- `.py` → tree-sitter with Python grammar + Python import resolver
- `.go` → tree-sitter with Go grammar + Go import resolver
- All other recognized extensions → tree-sitter with on-demand grammar + fallback import resolver
- Unknown → null (file skipped, not an error)

### File Structure

```
src/main/ast-parsers/
├── types.ts                — LanguageParser interface, ParsedFile type
├── registry.ts             — Extension → parser routing
├── ts-parser.ts            — Extracted from ast-analyzer.ts, implements LanguageParser
├── tree-sitter-parser.ts   — Generic tree-sitter parser using query-based extraction
├── grammar-manager.ts      — Download, cache, load WASM grammars
├── language-queries.ts     — Tree-sitter S-expression query patterns per language
└── import-resolvers/
    ├── typescript.ts        — Existing resolution logic
    ├── rust.ts              — mod/use/crate resolution
    ├── python.ts            — import/from, __init__.py awareness
    ├── go.ts                — go.mod module path resolution
    └── fallback.ts          — Best-effort relative path resolution
```

Note: C/C++, Java, Ruby, Swift, Kotlin import resolvers are deferred. Those languages use the fallback resolver for now — files still appear in the graph with declarations, just without resolved import edges. Full resolvers can be added per-language as needed.

## Grammar Manager

`grammar-manager.ts` handles the full WASM grammar lifecycle.

### web-tree-sitter Init

One shared `Parser` instance from `web-tree-sitter`. The tree-sitter WASM runtime (`tree-sitter.wasm`) is bundled with the app in `resources/`. Initialized once on first use (~50ms).

### Tier 1 (Bundled)

Rust, Python, Go grammar `.wasm` files ship in `resources/grammars/`:
- `tree-sitter-rust.wasm`
- `tree-sitter-python.wasm`
- `tree-sitter-go.wasm`

Loaded from disk on first use. No network required.

### Tier 2+ (On-Demand)

When the scanner encounters a file extension whose grammar isn't loaded:

1. Check `~/.pylon/grammars/<lang>.wasm` — if cached, load from disk
2. If not cached, fetch from `https://cdn.jsdelivr.net/npm/tree-sitter-wasms@latest/out/tree-sitter-<lang>.wasm`
3. Write to `~/.pylon/grammars/<lang>.wasm`, load it
4. If fetch fails (offline, unsupported language), skip those files, log a warning, continue analysis

### Progress Reporting

Grammar downloads report through the existing `AST_ANALYSIS_PROGRESS` IPC channel:
- "Downloading Rust grammar..." during first-time CDN fetch
- "Loading Python grammar..." when loading from cache
- Tier 1 bundled grammars load silently (too fast to warrant a message)

### Grammar → Language Mapping

```
tree-sitter-rust.wasm      → .rs
tree-sitter-python.wasm    → .py
tree-sitter-go.wasm        → .go
tree-sitter-c.wasm         → .c, .h
tree-sitter-cpp.wasm       → .cpp, .hpp, .cc, .cxx
tree-sitter-java.wasm      → .java
tree-sitter-ruby.wasm      → .rb
tree-sitter-swift.wasm     → .swift
tree-sitter-kotlin.wasm    → .kt
tree-sitter-bash.wasm      → .sh, .bash
tree-sitter-css.wasm       → .css, .scss
tree-sitter-html.wasm      → .html
```

## Tree-Sitter Parser

`tree-sitter-parser.ts` is a single generic parser that works for any language using **tree-sitter's query language** for precise, declarative extraction.

### Query-Based Extraction

Instead of walking the raw CST and filtering node types imperatively, we use tree-sitter's S-expression query system. Each language gets a set of query patterns that capture exactly the nodes we need — function names, class bodies, import paths — with zero noise from tokens, commas, braces, etc.

This approach is cleaner than CST walking because:
- The tree-sitter query engine does the filtering, not our code
- Queries are declarative and readable
- Adding a new language is just writing a new query string — no parsing logic changes
- The CST constraint (more nodes than an AST) becomes an advantage: queries let us extract exactly what we need with precision

### Query Patterns Per Language

Stored in `language-queries.ts` as S-expression query strings per language:

**Rust:**
```scheme
(function_item name: (identifier) @name) @function
(struct_item name: (type_identifier) @name) @class
(impl_item type: (type_identifier) @name) @class
(enum_item name: (type_identifier) @name) @type
(trait_item name: (type_identifier) @name) @type
(type_item name: (type_identifier) @name) @type
(const_item name: (identifier) @name) @variable
(static_item name: (identifier) @name) @variable
(use_declaration argument: (_) @path) @import
```

**Python:**
```scheme
(function_definition name: (identifier) @name) @function
(class_definition name: (identifier) @name) @class
(import_statement name: (dotted_name) @path) @import
(import_from_statement module_name: (dotted_name) @path) @import
```

**Go:**
```scheme
(function_declaration name: (identifier) @name) @function
(method_declaration name: (field_identifier) @name) @function
(type_declaration (type_spec name: (type_identifier) @name)) @type
(var_declaration) @variable
(const_declaration) @variable
(import_declaration (import_spec path: (interpreted_string_literal) @path)) @import
```

Additional languages (C/C++, Java, Ruby, Swift, Kotlin) follow the same pattern — one query file per language, extractable on demand when the grammar is loaded.

### Extraction Process

For each file:
1. Load grammar via grammar-manager
2. Parse source with `parser.parse(content)` → tree
3. Run the language's query against the tree → list of captures
4. Map each capture to an `AstNode`: capture name determines `AstNodeType`, node position gives start/end lines
5. For function/class captures with a body: run a child query for control flow nodes (if/for/while/match/return/call), depth-limited to 6
6. For import captures: extract the module specifier from the `@path` capture

Output is identical `ParsedFile` — same `AstNode[]` and import arrays as the TS parser.

### AstNodeType Mapping

Query capture names map directly to `AstNodeType`:
- `@function` captures → `'function'`
- `@class` captures → `'class'`
- `@type` captures → `'type'`
- `@variable` captures → `'variable'`
- `@import` captures → `'import'`
- Control flow child captures → `'statement'`
- Call expression captures → `'expression'`

## Import Resolvers (Tier 1 + Fallback)

### TypeScript (existing)

Relative imports resolved by trying: `''`, `.ts`, `.tsx`, `.js`, `.jsx`, `/index.ts`, `/index.tsx`, `/index.js`.
Non-relative imports (bare specifiers like `react`, `zustand`) are unresolved — silently dropped from the edge list. In the optional manifest phase, they would link to manifest dependency nodes instead.

### Rust

- `use crate::module::item` → resolve `crate::` to project root (directory containing `Cargo.toml`), then `module` maps to `module.rs` or `module/mod.rs`
- `use self::submod` → relative to current file's directory
- `use super::parent` → parent directory
- External crates (`use tokio::`, `use serde::`) → unresolved (dropped, or linked to manifest in optional phase)

### Python

- `from .utils import x` → relative dot notation, one dot = current package, two = parent
- `from mypackage.module import x` → absolute import, resolve from project root
- `__init__.py` marks directories as packages
- `import numpy` → unresolved (external)

### Go

- `import "myproject/pkg/utils"` → strip module path prefix from `go.mod`, resolve remainder as directory
- `import "fmt"`, `import "net/http"` → standard library, skip
- External modules → unresolved

### Fallback

For all other languages: attempt relative path resolution with the import specifier (strip quotes, resolve relative to source file, try common extensions for that language). If it doesn't resolve, drop the edge silently.

## Contextual Dependency Display

External dependencies are shown contextually, not dumped into the graph:

### CodePanel Enhancement

When a file is selected and its code is displayed, a collapsible "External Dependencies" section appears below the file header showing which external packages this file imports. Each entry shows the package name and import path. This is derived from the file's unresolved imports (imports that didn't match any internal file).

### Dependencies Overlay (scoped)

When the "Dependencies" overlay toggle is active in the toolbar, external packages appear as small peripheral nodes in the graph — but only for packages imported by files in the currently visible cluster/scope, not all 200 from a manifest. This keeps the graph focused while still showing the external dependency picture when requested.

## Optional Phase: Manifest Parsing

This phase is not required for the core multi-language feature to ship. It adds richer external dependency information but can be built after the parser and resolver work is complete.

`manifest-parser.ts` would parse package manifests and produce dependency data:

| Manifest | Format | Parser | Extracts |
|----------|--------|--------|----------|
| `package.json` | JSON | `JSON.parse` | `dependencies` + `devDependencies` keys and versions |
| `Cargo.toml` | TOML | `smol-toml` | `[dependencies]` + `[dev-dependencies]` names and versions |
| `go.mod` | Text | Line regex | `require` block: module paths and versions |
| `pyproject.toml` | TOML | `smol-toml` | `[project.dependencies]` entries |
| `requirements.txt` | Text | Line regex | Package names (strip version specifiers) |

When present, unresolved external imports link to manifest entries, enriching the contextual dependency display with version information. Without manifest parsing, external dependencies are still detected (from unresolved imports) — they just don't have version/metadata.

**New dependency (optional phase only):** `smol-toml` (8KB, zero-dep TOML parser) for Cargo.toml and pyproject.toml.

## Changes to Existing Code

### `ast-analyzer.ts` (modified)

- `collectFiles()` now uses `registry.getParseableExtensions()` instead of hardcoded `PARSEABLE_EXTENSIONS`
- `analyzeScope()` calls `registry.getParser(ext)` per file instead of directly calling `parseFile()`
- Import resolution uses `registry.getResolver(ext)` per file
- `FileNode.language` field now carries the actual language string from the registry

### `ast-analyzer.ts` → `ts-parser.ts` (extracted)

The TypeScript-specific parsing logic (ts.createSourceFile, forEachChild walking, import extraction) is extracted into `src/main/ast-parsers/ts-parser.ts` implementing the `LanguageParser` interface. `ast-analyzer.ts` becomes a thin orchestrator.

### CodePanel.tsx (minor addition)

Add a collapsible "External Dependencies" section showing unresolved imports for the selected file. This section reads from the `FileNode.imports` data already available in the store — imports whose specifiers don't match any file in the graph are external.

### No other renderer changes

- `ast-constants.ts` NODE_COLORS are keyed by `AstNodeType` which is language-agnostic
- `RepoMapView`, `FileAstView` render `AstNode[]` without language awareness
- Zustand store, IPC channels, bridge hook — all unchanged

## Performance

| Operation | Cost |
|-----------|------|
| web-tree-sitter init | ~50ms (one-time) |
| Grammar load from bundled | ~20ms per grammar |
| Grammar load from cache | ~20ms per grammar |
| Grammar download from CDN | 200-500ms per grammar (first time only) |
| tree-sitter parse per file | <5ms for typical files |
| Net impact on 500-file mixed repo | ~300ms additional (3 grammars from cache) |

## Testing

- **ts-parser.test.ts** — Existing tests adapted for extracted TS parser
- **tree-sitter-parser.test.ts** — Parse Rust/Python/Go snippets using query-based extraction, verify correct AstNode output
- **grammar-manager.test.ts** — Cache hit/miss, mock CDN download, offline fallback
- **import-resolvers/{rust,python,go}.test.ts** — Each resolver tested with temp file fixtures
- **integration test** — Mixed-language directory (TS + Rust + Python) produces unified RepoGraph with correct cross-file edges

## Out of Scope

- Transitive dependency resolution (only direct dependencies from manifests)
- Lock file parsing (package-lock.json, Cargo.lock, etc.)
- Workspace/monorepo manifest merging (e.g., Cargo workspace members)
- Language server protocol integration
- Incremental tree-sitter parsing (re-parse full file on change — fast enough)
- C/C++, Java, Ruby, Swift, Kotlin import resolvers (use fallback for now)

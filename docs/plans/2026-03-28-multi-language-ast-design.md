# Multi-Language AST Support — Design Spec

> Extends the AST Visualizer with tree-sitter parsing for non-JS languages, dynamic grammar loading, and package manifest dependency nodes.

## Overview

The v1 AST Visualizer only parses TS/JS/TSX/JSX files. This extension adds support for any language via web-tree-sitter (WASM-based), with Tier 1 grammars (Rust, Python, Go) bundled and all others downloaded on demand from a CDN and cached locally. Package manifests (`package.json`, `Cargo.toml`, `go.mod`, `pyproject.toml`, `requirements.txt`) are parsed to produce dependency nodes in the graph.

No changes to the renderer, Zustand store, IPC channels, or graph components — all work happens in the main process behind the existing `RepoGraph` interface.

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
- `.c/.cpp/.h/.hpp` → tree-sitter with C/C++ grammar + C include resolver
- `.java` → tree-sitter with Java grammar + Java import resolver
- `.rb` → tree-sitter with Ruby grammar + Ruby require resolver
- `.swift` → tree-sitter with Swift grammar + Swift import resolver
- `.kt` → tree-sitter with Kotlin grammar + Kotlin import resolver
- Unknown → null (file skipped, not an error)

### File Structure

```
src/main/ast-parsers/
├── types.ts                — LanguageParser interface, ParsedFile type
├── registry.ts             — Extension → parser routing
├── ts-parser.ts            — Extracted from ast-analyzer.ts, implements LanguageParser
├── tree-sitter-parser.ts   — Generic tree-sitter parser, configurable per language
├── grammar-manager.ts      — Download, cache, load WASM grammars
├── manifest-parser.ts      — Parse package.json, Cargo.toml, go.mod, etc.
├── language-queries.ts     — Tree-sitter query patterns per language
└── import-resolvers/
    ├── typescript.ts        — Existing resolution logic
    ├── rust.ts              — mod/use/crate resolution
    ├── python.ts            — import/from, __init__.py awareness
    ├── go.ts                — go.mod module path resolution
    ├── c-cpp.ts             — #include "quoted" resolution
    ├── java.ts              — dot-separated package → directory
    ├── ruby.ts              — require_relative resolution
    └── fallback.ts          — Best-effort relative path resolution
```

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

`tree-sitter-parser.ts` is a single generic parser that works for any language using configurable query patterns.

### Query Patterns Per Language

Stored in `language-queries.ts` as a map of language → node type queries:

| Language | Functions | Classes/Structs | Types | Variables | Imports |
|----------|-----------|-----------------|-------|-----------|---------|
| Rust | `function_item` | `impl_item`, `struct_item` | `type_item`, `enum_item`, `trait_item` | `let_declaration`, `const_item`, `static_item` | `use_declaration` |
| Python | `function_definition` | `class_definition` | — | `assignment` (module-level) | `import_statement`, `import_from_statement` |
| Go | `function_declaration`, `method_declaration` | — | `type_declaration` | `var_declaration`, `const_declaration` | `import_declaration` |
| C/C++ | `function_definition` | `class_specifier`, `struct_specifier` | `type_definition` | `declaration` (global) | `preproc_include` |
| Java | `method_declaration` | `class_declaration`, `interface_declaration` | `enum_declaration` | `field_declaration` | `import_declaration` |
| Ruby | `method`, `singleton_method` | `class`, `module` | — | `assignment` (top-level) | `call` (require/require_relative) |
| Swift | `function_declaration` | `class_declaration`, `struct_declaration` | `protocol_declaration`, `enum_declaration` | `property_declaration` | `import_declaration` |
| Kotlin | `function_declaration` | `class_declaration`, `object_declaration` | `type_alias` | `property_declaration` | `import_header` |

### Extraction Process

For each file:
1. Load grammar via grammar-manager
2. Parse source with `parser.parse(content)`
3. Walk root node's children, match against the language's query patterns
4. For each match: extract name (from named child nodes), start/end lines, map CST node type to `AstNodeType`
5. For function/class bodies: walk children recursively (depth limit 6) for control flow nodes (if/for/while/match/try/return/call)
6. For import nodes: extract module specifier and named specifiers

Output is identical `ParsedFile` — same `AstNode[]` and import arrays as the TS parser.

### AstNodeType Mapping

Tree-sitter CST node types map to our existing `AstNodeType` union:
- Function/method declarations → `'function'`
- Class/struct/impl declarations → `'class'`
- Type/enum/trait/interface declarations → `'type'`
- Variable/const/let/assignment → `'variable'`
- Import/use/include → `'import'`
- Control flow (if/for/while/match/switch) → `'statement'`
- Function calls → `'expression'`
- Block bodies → `'block'`

## Import Resolvers

### TypeScript (existing)

Relative imports resolved by trying: `''`, `.ts`, `.tsx`, `.js`, `.jsx`, `/index.ts`, `/index.tsx`, `/index.js`.
Non-relative imports (bare specifiers) → produce edge to manifest dependency node.

### Rust

- `use crate::module::item` → resolve `crate::` to project root (directory containing `Cargo.toml`), then `module` maps to `module.rs` or `module/mod.rs`
- `use self::submod` → relative to current file's directory
- `use super::parent` → parent directory
- External crates (`use tokio::`, `use serde::`) → edge to Cargo.toml dependency node

### Python

- `from .utils import x` → relative dot notation, one dot = current package, two = parent
- `from mypackage.module import x` → absolute import, resolve from project root
- `__init__.py` marks directories as packages
- `import numpy` → edge to manifest dependency node

### Go

- `import "myproject/pkg/utils"` → strip module path prefix from `go.mod`, resolve remainder as directory
- `import "fmt"`, `import "net/http"` → standard library, skip
- External modules → edge to go.mod dependency node

### C/C++

- `#include "header.h"` → resolve relative to source file directory
- `#include <system/header.h>` → skip (system include)

### Java

- `import com.example.Foo` → map dots to `/`, resolve under `src/main/java/` or `src/`
- `import java.util.*` → skip (standard library)

### Ruby

- `require_relative './foo'` → resolve relative to file, append `.rb`
- `require 'gemname'` → edge to manifest dependency node (Gemfile, if present)

### Fallback

For unsupported languages: attempt relative path resolution with the import specifier. If it doesn't resolve, skip the edge.

## Manifest Parser

`manifest-parser.ts` parses package manifests and produces `FileNode` entries for the graph.

| Manifest | Format | Parser | Extracts |
|----------|--------|--------|----------|
| `package.json` | JSON | `JSON.parse` | `dependencies` + `devDependencies` keys and versions |
| `Cargo.toml` | TOML | `smol-toml` | `[dependencies]` + `[dev-dependencies]` names and versions |
| `go.mod` | Text | Line regex | `require` block: module paths and versions |
| `pyproject.toml` | TOML | `smol-toml` | `[project.dependencies]` entries |
| `requirements.txt` | Text | Line regex | Package names (strip version specifiers) |

Each manifest produces a `FileNode` with:
- `filePath`: path to the manifest
- `language`: `'manifest'`
- `declarations`: one `AstNode` per dependency (type: `'variable'`, name: package name)
- `imports`: empty (manifests don't import)
- `size`, `lastModified`: from filesystem

External import edges from source files point to the manifest `FileNode`. In the graph, manifest nodes render as smaller muted nodes grouped in a "Dependencies" cluster by Claude's layer analysis.

**New dependency:** `smol-toml` (8KB, zero-dep TOML parser) for Cargo.toml and pyproject.toml.

## Changes to Existing Code

### `ast-analyzer.ts` (modified)

- `collectFiles()` now uses `registry.getParseableExtensions()` instead of hardcoded `PARSEABLE_EXTENSIONS`
- Also collects manifest files (`package.json`, `Cargo.toml`, `go.mod`, `pyproject.toml`, `requirements.txt`)
- `analyzeScope()` calls `registry.getParser(ext)` per file instead of directly calling `parseFile()`
- After parsing all files, links external imports to manifest dependency nodes
- `FileNode.language` field now carries the actual language string from the registry

### `ast-analyzer.ts` → `ts-parser.ts` (extracted)

The TypeScript-specific parsing logic (ts.createSourceFile, forEachChild walking, import extraction) is extracted into `src/main/ast-parsers/ts-parser.ts` implementing the `LanguageParser` interface. `ast-analyzer.ts` becomes a thin orchestrator.

### No renderer changes

- `CodePanel.tsx` already has Shiki support for all target languages
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
| Manifest parse | <1ms per file |
| Net impact on 500-file mixed repo | ~300ms additional (3 grammars from cache) |

## Testing

- **ts-parser.test.ts** — Existing tests adapted for extracted TS parser
- **tree-sitter-parser.test.ts** — Parse Rust/Python/Go snippets, verify correct AstNode extraction
- **grammar-manager.test.ts** — Cache hit/miss, mock CDN download, offline fallback
- **manifest-parser.test.ts** — Parse each manifest format, verify dependency extraction
- **import-resolvers/*.test.ts** — Each resolver tested with temp file fixtures
- **integration test** — Mixed-language directory (TS + Rust + Python) produces unified RepoGraph with correct cross-file edges and manifest dependencies

## Out of Scope

- Transitive dependency resolution (only direct dependencies from manifests)
- Lock file parsing (package-lock.json, Cargo.lock, etc.)
- Workspace/monorepo manifest merging (e.g., Cargo workspace members)
- Language server protocol integration
- Incremental tree-sitter parsing (re-parse full file on change — fast enough)

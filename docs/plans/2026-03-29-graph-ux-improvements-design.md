# Graph UX Improvements — Design Spec

> **Thesis:** Make large codebases navigable by showing less by default and revealing detail on demand.

## Overview

Five interconnected UX improvements to the AST Visualizer's repo map view, all renderer-side:

1. **Collapse-first rendering** — Directory clusters start collapsed as summary nodes
2. **Semantic zoom** — Zoom level controls what renders (clusters → files → declarations)
3. **Ego network on click** — Click dims everything except the node and its neighbors
4. **Search-to-focus** — Toolbar search highlights and centers matching nodes
5. **Minimap** — Thumbnail overview for spatial orientation

## 1. Collapse-First Rendering

The `computeRepoLayout` function currently positions every file as an individual node. Instead:

- Group files by their directory (e.g., `src/main/`, `src/renderer/src/components/`, `src/shared/`)
- Directories render as **collapsed cluster nodes** by default — showing: directory name, file count, layer color
- Clicking a cluster node **expands** it in-place, revealing its file nodes inside
- Clicking the cluster label again **collapses** it back

**Store additions:**
- `expandedClusters: Set<string>` — which directory clusters are expanded
- `toggleCluster(clusterId: string)` — expand/collapse a cluster

**Layout changes:**
- `computeRepoLayout` needs a new parameter: `expandedClusters: Set<string>`
- Collapsed clusters → single large node (width scaled by file count)
- Expanded clusters → existing behavior (file nodes + bounding box)
- Force simulation runs on the mixed graph (some clusters collapsed, some expanded)

**Initial state:** All clusters collapsed. User expands what they need.

## 2. Semantic Zoom

Three discrete zoom levels control what renders:

| Zoom range | Level | What renders |
|-----------|-------|-------------|
| < 0.3 | Overview | Only cluster summary nodes (collapsed), thick aggregate edges between clusters |
| 0.3 – 1.2 | Standard | Expanded clusters show file nodes; collapsed clusters show summaries |
| > 1.2 | Detail | Hovered/selected file nodes expand inline to show top-level declarations |

**Implementation:** A derived `zoomLevel` computed from the `zoom` value. The `RepoMapView` reads `zoomLevel` and conditionally renders different elements. This is NOT CSS scaling — it's conditional rendering.

**Store additions:**
- `zoomLevel: 'overview' | 'standard' | 'detail'` — derived from `zoom` value

At overview zoom, even expanded clusters collapse visually (overridden by zoom level). At detail zoom, hovering a file shows its declarations as a sub-list inside the node rect.

## 3. Ego Network on Click

Single-click a node → **focus mode**: dim everything else to 15% opacity, show only the clicked node + its direct import neighbors (both incoming and outgoing) at full opacity. The edge lines connecting them also stay at full opacity.

Double-click → existing behavior (drill into file AST view).

**Store additions:**
- `focusedNode: string | null` — the ego network center node
- `setFocusedNode(nodeId: string | null)` — set or clear focus

Clicking empty canvas clears focus. The dimming is applied via SVG `opacity` on nodes/edges that aren't in the focus set.

**Computing the ego set:** From `repoGraph.edges`, collect all files that are direct imports of the focused file (outgoing) or that import the focused file (incoming). This set + the focused file = the visible neighborhood.

## 4. Search-to-Focus

The toolbar search input (currently a placeholder) becomes functional:

- Type a query → fuzzy-match against all file names in the graph
- Matching nodes get a highlight ring
- First match auto-centers the viewport (setPan to bring it into view)
- Non-matching nodes dim to 30% opacity (similar to ego network)
- Clear the search → restore all nodes

**Store additions:**
- `searchQuery: string`
- `searchMatches: string[]` — file paths that match
- `setSearchQuery(query: string)` — sets query and computes matches

**Fuzzy matching:** Simple substring match on file name (not full path). Case-insensitive. Good enough for v1.

## 5. Minimap

A small (200x140px) fixed-position panel in the bottom-right of the graph canvas:

- Shows all nodes as tiny colored dots (cluster colors)
- Shows the current viewport as a semi-transparent rectangle
- Click in the minimap → jump viewport to that position
- Drag the viewport rectangle → pan the main canvas

**Implementation:** A separate `<svg>` element positioned absolutely over the graph canvas. It mirrors the layout data but renders at a much smaller scale. The viewport rectangle is computed from the main canvas's current pan/zoom state.

## Store Changes Summary

New fields in `ast-store.ts`:
```
expandedClusters: Set<string>
focusedNode: string | null
searchQuery: string
searchMatches: string[]
```

New actions:
```
toggleCluster(clusterId: string)
setFocusedNode(nodeId: string | null)
setSearchQuery(query: string)
```

Derived value:
```
zoomLevel: computed from zoom threshold (< 0.3 overview, 0.3-1.2 standard, > 1.2 detail)
```

## Component Changes

| Component | Changes |
|-----------|---------|
| `ast-store.ts` | Add new state fields and actions |
| `ast-layout.ts` | `computeRepoLayout` accepts `expandedClusters` param; collapsed clusters become single nodes |
| `RepoMapView.tsx` | Conditional rendering by zoom level; ego network dimming; cluster expand/collapse; search highlighting |
| `GraphCanvas.tsx` | Auto-fit on initial render; pass viewport bounds for minimap |
| `AstToolbar.tsx` | Wire up search input with debounced query |
| New: `Minimap.tsx` | Thumbnail overview component |

## No Backend Changes

All improvements are renderer-side. No new IPC channels, no main process changes, no type changes in `shared/types.ts`.

## Performance

- Collapsed clusters reduce rendered SVG elements from N files to ~10 cluster nodes
- Semantic zoom prevents rendering file nodes when zoomed out
- Ego network doesn't remove nodes from DOM — just changes opacity (CSS, not re-render)
- Minimap re-renders only on pan/zoom changes (throttled to 60fps via rAF)

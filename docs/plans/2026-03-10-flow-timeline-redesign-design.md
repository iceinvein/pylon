# Flow Panel Timeline Redesign

## Overview

Redesign the flow panel from flat card list to a left-aligned timeline with visual hierarchy. Different node types get different visual treatments (loud cards vs quiet inline text), connected by a gradient spine with styled dots.

## Timeline Spine

- Thin (1.5px) vertical line running down the left side, 20px from the panel edge
- Gradient color: starts `stone-700` at the top, transitions toward `stone-500` at the active/bottom node. During streaming, the bottom fades to the active node's accent color
- Dots sit centered on the line, nodes extend to the right

## Dot Types

| Node Type | Dot Style |
|-----------|-----------|
| Edit, Execute, Tasks | Filled circle (6px), accent color |
| Explore, Think | Hollow circle (6px), stone-600 stroke |
| Agent (subagent) | Diamond (8px), cyan fill |
| Ask user | Filled circle (6px), orange |
| Error-fix | Filled circle (6px), red |
| Active node | Pulsing ring around the dot |

## Node Treatments

### Loud (card style)
Agents, Edits, Execute, Ask user, Tasks, Error-fix:
- Background card with border (same accent colors as current)
- Attached to dot via a short horizontal connector (8px line from dot to card left edge)
- Full label text, expand chevron for details

### Quiet (inline text)
Explore, Think:
- No card background, just text rendered inline next to the dot
- Muted text color (stone-500 for think, stone-400 for explore)
- Smaller font size (10px vs 12px for cards)
- Think gets italic styling

## Parallel Branches (indented sub-lanes)

```
  ◆─── Agent: Implement sidebar
  │
  │  ○── Agent: Spec review
  │  ○── Agent: Code quality review
  │
  ●─── Ran 2 commands
```

- Parallel nodes indent ~16px from the spine
- Get their own smaller dots (4px) on a sub-line
- Sub-line connects to the main spine at top and bottom
- No horizontal connectors for parallel nodes (the indent is the signal)

## Active Node

- The dot gets a pulsing ring animation (CSS keyframes)
- The gradient line terminates at this node's accent color
- Card gets a subtle glow matching its accent

## Spacing

- 8px gap between quiet nodes (explore/think)
- 12px gap between loud nodes (cards)
- 16px gap around parallel groups

## Files to Modify

- `src/renderer/src/components/flow/FlowPanel.tsx` — timeline layout structure
- `src/renderer/src/components/flow/FlowNode.tsx` — loud vs quiet rendering, dot styles
- `src/renderer/src/components/flow/flow-constants.ts` — add dot config per node type
- `src/renderer/src/lib/flow-types.ts` — add dot style to type (if needed)
- `src/renderer/src/styles/globals.css` — timeline gradient, pulse animations

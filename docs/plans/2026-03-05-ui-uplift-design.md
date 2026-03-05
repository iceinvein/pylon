# UI Uplift Design

## Typography

- **Prose/UI**: Inter (Google Fonts)
- **Code/tools**: JetBrains Mono (Google Fonts)
- Base: 14px body, 13px tools, 12px meta

## Colour Palette — Warm Stone

| Token | Value | Usage |
|---|---|---|
| bg-base | #1c1917 (stone-950) | App background |
| bg-surface | #292524 (stone-800) | Cards, user messages, input |
| bg-surface-hover | #44403c (stone-700) | Hover states |
| text-primary | #e7e5e4 (stone-200) | Main text |
| text-secondary | #a8a29e (stone-400) | Secondary, labels |
| text-muted | #78716c (stone-500) | Hints, timestamps |
| border | #44403c (stone-700) | All borders |
| accent | #d97706 (amber-600) | User bar, active states |
| accent-muted | #92400e (amber-800) | Subtle accent bg |

## Chat Layout — Sticky User Messages

- User messages: `position: sticky; top: 0; z-index: 10`
- Stone-800 bg + 3px amber left border
- Next user message naturally replaces previous sticky header
- Pure CSS, no JS

## Message Styling

- **User**: Stone-800 bg, amber left bar, sticky
- **Assistant**: Full-width, no bg, Inter font, generous line-height
- **Tools**: Monospace JetBrains Mono, collapsible, stone-700 border
- **Code blocks**: Rich — language label, copy button, syntax highlight

## Code Block Rendering

- Language badge top-left (mono, muted)
- Copy button top-right (hover reveal)
- Background: stone-900/80, border: stone-700
- Use react-markdown custom components (no extra deps for now, CSS-based highlighting)

## Input Bar

- Rounded stone-800 bg, subtle inner shadow
- Amber focus ring
- Send button: amber when active, stone when disabled

## Layout

- No structural changes
- Chat content max-width 768px, centered
- Slightly more padding (px-6)
- Warm stone reskin of TabBar, NavRail, StatusBar

## Fonts Loading

- `@import` in globals.css from Google Fonts
- CSS custom properties for font stacks

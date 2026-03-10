import Convert from 'ansi-to-html'

const converter = new Convert({
  fg: '#d6d3d1', // stone-300
  bg: 'transparent',
  newline: true,
  escapeXML: true,
  colors: {
    // Map ANSI colors to the warm stone palette
    0: '#1c1917', // black → base bg
    1: '#ef4444', // red
    2: '#22c55e', // green
    3: '#eab308', // yellow
    4: '#60a5fa', // blue
    5: '#c084fc', // magenta
    6: '#22d3ee', // cyan
    7: '#d6d3d1', // white → stone-300
    8: '#57534e', // bright black → stone-600
    9: '#f87171', // bright red
    10: '#4ade80', // bright green
    11: '#facc15', // bright yellow
    12: '#93c5fd', // bright blue
    13: '#d8b4fe', // bright magenta
    14: '#67e8f9', // bright cyan
    15: '#fafaf9', // bright white → stone-50
  },
})

// biome-ignore lint/suspicious/noControlCharactersInRegex: intentional ANSI escape matching
const ANSI_REGEX = /\x1b\[[0-9;]*m/

export function hasAnsiCodes(text: string): boolean {
  return ANSI_REGEX.test(text)
}

export function ansiToHtml(text: string): string {
  return converter.toHtml(text)
}

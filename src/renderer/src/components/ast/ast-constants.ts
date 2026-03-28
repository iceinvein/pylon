import type { AstNodeType } from '../../../../shared/types'

export const NODE_COLORS: Record<AstNodeType, string> = {
  function: '#7ee787',
  class: '#d2a8ff',
  type: '#79c0ff',
  variable: '#ffa657',
  import: '#8b949e',
  export: '#8b949e',
  block: '#484f58',
  statement: '#ff7b72',
  expression: '#a5d6ff',
  parameter: '#d2a8ff',
  other: '#484f58',
}

export const NODE_LABELS: Record<AstNodeType, string> = {
  function: 'fn',
  class: 'class',
  type: 'type',
  variable: 'var',
  import: 'import',
  export: 'export',
  block: 'block',
  statement: 'stmt',
  expression: 'expr',
  parameter: 'param',
  other: '...',
}

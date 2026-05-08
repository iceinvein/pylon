import type { AstNodeType } from '../../../../shared/types'

export const NODE_COLORS: Record<AstNodeType, string> = {
  function: 'var(--color-success)',
  class: 'var(--color-special-text)',
  type: 'var(--color-info)',
  variable: 'var(--color-warning)',
  import: 'var(--color-base-text-muted)',
  export: 'var(--color-base-text-muted)',
  block: 'var(--color-base-border)',
  statement: 'var(--color-error)',
  expression: '#9fc5e8',
  parameter: '#c7b4e3',
  other: 'var(--color-base-border)',
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

import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { RepoGraph } from '../../../../shared/types'
import { FALLBACK_PROVIDER_MODELS } from '../../lib/provider-models'
import { useAstStore } from '../../store/ast-store'
import { AstToolbar } from './AstToolbar'

const repoGraph: RepoGraph = {
  files: [
    {
      filePath: '/repo/src/main.ts',
      language: 'typescript',
      declarations: [],
      imports: [],
      size: 1,
      lastModified: 1,
    },
  ],
  edges: [],
}

describe('AstToolbar', () => {
  test('renders an explicit code agent selector in the toolbar', () => {
    useAstStore.getState().reset()

    const html = renderToStaticMarkup(
      createElement(AstToolbar, {
        scope: '/workspace/pylon',
        repoGraph,
        archAnalysis: null,
        analysisStatus: 'ready',
        providerModels: FALLBACK_PROVIDER_MODELS,
        agentProvider: 'claude',
        agentModel: 'claude-opus-4-7',
        agentEffort: 'high',
        onAgentSelectionChange: () => {},
        onReanalyze: () => {},
        onSwitchProject: () => {},
        onBrowse: () => {},
      }),
    )

    expect(html).toContain('Agent')
    expect(html).toContain('Claude')
    expect(html).toContain('Codex')
    expect(html).toContain('Code agent model')
    expect(html).toContain('Re-analyze')
  })
})

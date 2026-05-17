import { beforeEach, describe, expect, test } from 'bun:test'
import type { AstChatMessage, AstOverlay, RepoGraph } from '../../../shared/types'
import { useAstStore } from './ast-store'

function resetStore() {
  useAstStore.getState().reset()
}

function makeGraph(): RepoGraph {
  return {
    files: [
      {
        filePath: '/workspace/app/src/components/Button.tsx',
        language: 'tsx',
        declarations: [
          {
            id: 'Button',
            type: 'function',
            name: 'Button',
            startLine: 1,
            endLine: 10,
            children: [],
            filePath: '/workspace/app/src/components/Button.tsx',
          },
        ],
        imports: [],
        size: 100,
        lastModified: 1700000000,
      },
      {
        filePath: '/workspace/app/src/store/session-store.ts',
        language: 'typescript',
        declarations: [
          {
            id: 'createSessionStore',
            type: 'function',
            name: 'createSessionStore',
            startLine: 1,
            endLine: 20,
            children: [
              {
                id: 'restoreSession',
                type: 'function',
                name: 'restoreSession',
                startLine: 5,
                endLine: 8,
                children: [],
                filePath: '/workspace/app/src/store/session-store.ts',
              },
            ],
            filePath: '/workspace/app/src/store/session-store.ts',
          },
        ],
        imports: [],
        size: 200,
        lastModified: 1700000000,
      },
    ],
    edges: [],
  }
}

describe('ast-store', () => {
  beforeEach(resetStore)

  describe('initial state', () => {
    test('has correct defaults', () => {
      const s = useAstStore.getState()
      expect(s.scope).toBe('')
      expect(s.repoGraph).toBeNull()
      expect(s.archAnalysis).toBeNull()
      expect(s.fileAst).toBeNull()
      expect(s.selectedFile).toBeNull()
      expect(s.selectedNode).toBeNull()
      expect(s.hoveredNode).toBeNull()
      expect(s.activeOverlays.size).toBe(0)
      expect(s.chatMessages).toEqual([])
      expect(s.analysisStatus).toBe('idle')
      expect(s.analysisProgress).toBe('')
      expect(s.explainText).toBeNull()
      expect(s.explainLoading).toBe(false)
      expect(s.chatLoading).toBe(false)
      expect(s.agentModel).toBe('claude-opus-4-7')
      expect(s.agentEffort).toBe('high')
      expect(s.agentSelectionRevision).toBeNumber()
      expect(s.zoom).toBe(1)
      expect(s.panX).toBe(0)
      expect(s.panY).toBe(0)
      expect(s.searchQuery).toBe('')
      expect(s.searchMatches).toEqual([])
    })
  })

  describe('setScope', () => {
    test('sets the scope string', () => {
      useAstStore.getState().setScope('/home/user/project')
      expect(useAstStore.getState().scope).toBe('/home/user/project')
    })
  })

  describe('setRepoGraph', () => {
    test('sets the repo graph', () => {
      const graph = { files: [], edges: [] }
      useAstStore.getState().setRepoGraph(graph)
      expect(useAstStore.getState().repoGraph).toEqual(graph)
    })

    test('recomputes existing search when the graph changes', () => {
      useAstStore.getState().setSearchQuery('session')
      useAstStore.getState().setRepoGraph(makeGraph())
      expect(useAstStore.getState().searchMatches).toEqual([
        '/workspace/app/src/store/session-store.ts',
      ])
    })
  })

  describe('setArchAnalysis', () => {
    test('sets arch analysis', () => {
      const analysis = {
        layers: [],
        clusters: [],
        annotations: {},
        callEdges: [],
        dataFlows: [],
      }
      useAstStore.getState().setArchAnalysis(analysis)
      expect(useAstStore.getState().archAnalysis).toEqual(analysis)
    })
  })

  describe('setFileAst', () => {
    test('sets file AST nodes', () => {
      const nodes = [
        {
          id: 'n1',
          type: 'function' as const,
          name: 'myFn',
          startLine: 1,
          endLine: 5,
          children: [],
          filePath: '/src/foo.ts',
        },
      ]
      useAstStore.getState().setFileAst(nodes)
      expect(useAstStore.getState().fileAst).toEqual(nodes)
    })

    test('can set to null', () => {
      useAstStore.getState().setFileAst(null)
      expect(useAstStore.getState().fileAst).toBeNull()
    })
  })

  describe('selectFile', () => {
    test('sets selectedFile and clears selectedNode', () => {
      useAstStore.setState({ selectedNode: 'some-node' })
      useAstStore.getState().selectFile('/src/foo.ts')
      const s = useAstStore.getState()
      expect(s.selectedFile).toBe('/src/foo.ts')
      expect(s.selectedNode).toBeNull()
    })

    test('can set to null', () => {
      useAstStore.setState({ selectedFile: '/src/foo.ts' })
      useAstStore.getState().selectFile(null)
      expect(useAstStore.getState().selectedFile).toBeNull()
    })
  })

  describe('selectNode', () => {
    test('sets selectedNode', () => {
      useAstStore.getState().selectNode('node-123')
      expect(useAstStore.getState().selectedNode).toBe('node-123')
    })

    test('can clear with null', () => {
      useAstStore.setState({ selectedNode: 'node-123' })
      useAstStore.getState().selectNode(null)
      expect(useAstStore.getState().selectedNode).toBeNull()
    })
  })

  describe('setHoveredNode', () => {
    test('sets hoveredNode', () => {
      useAstStore.getState().setHoveredNode('node-abc')
      expect(useAstStore.getState().hoveredNode).toBe('node-abc')
    })
  })

  describe('toggleOverlay', () => {
    test('adds overlay when not present', () => {
      const overlay: AstOverlay = 'deps'
      useAstStore.getState().toggleOverlay(overlay)
      expect(useAstStore.getState().activeOverlays.has(overlay)).toBe(true)
    })

    test('removes overlay when already present', () => {
      const overlay: AstOverlay = 'calls'
      useAstStore.setState({ activeOverlays: new Set([overlay]) })
      useAstStore.getState().toggleOverlay(overlay)
      expect(useAstStore.getState().activeOverlays.has(overlay)).toBe(false)
    })

    test('can toggle multiple overlays independently', () => {
      useAstStore.getState().toggleOverlay('groups')
      useAstStore.getState().toggleOverlay('deps')
      useAstStore.getState().toggleOverlay('calls')
      const s = useAstStore.getState()
      expect(s.activeOverlays.has('groups')).toBe(true)
      expect(s.activeOverlays.has('deps')).toBe(true)
      expect(s.activeOverlays.has('calls')).toBe(true)
      expect(s.activeOverlays.has('dataflow')).toBe(false)
    })
  })

  describe('addChatMessage', () => {
    test('appends messages', () => {
      const msg1: AstChatMessage = { role: 'user', content: 'hello' }
      const msg2: AstChatMessage = { role: 'assistant', content: 'world' }
      useAstStore.getState().addChatMessage(msg1)
      useAstStore.getState().addChatMessage(msg2)
      expect(useAstStore.getState().chatMessages).toEqual([msg1, msg2])
    })
  })

  describe('setAnalysisStatus', () => {
    test('sets status', () => {
      useAstStore.getState().setAnalysisStatus('parsing')
      expect(useAstStore.getState().analysisStatus).toBe('parsing')
    })

    test('sets status with progress message', () => {
      useAstStore.getState().setAnalysisStatus('analyzing', 'Parsed 10 files')
      const s = useAstStore.getState()
      expect(s.analysisStatus).toBe('analyzing')
      expect(s.analysisProgress).toBe('Parsed 10 files')
    })

    test('preserves existing progress when none provided', () => {
      useAstStore.setState({ analysisProgress: 'existing message' })
      useAstStore.getState().setAnalysisStatus('ready')
      expect(useAstStore.getState().analysisProgress).toBe('existing message')
    })
  })

  describe('setExplain', () => {
    test('sets explain text and loading state', () => {
      useAstStore.getState().setExplain('explanation text', false)
      const s = useAstStore.getState()
      expect(s.explainText).toBe('explanation text')
      expect(s.explainLoading).toBe(false)
    })

    test('can set loading true with null text', () => {
      useAstStore.getState().setExplain(null, true)
      const s = useAstStore.getState()
      expect(s.explainText).toBeNull()
      expect(s.explainLoading).toBe(true)
    })
  })

  describe('setChatLoading', () => {
    test('sets chat loading', () => {
      useAstStore.getState().setChatLoading(true)
      expect(useAstStore.getState().chatLoading).toBe(true)
      useAstStore.getState().setChatLoading(false)
      expect(useAstStore.getState().chatLoading).toBe(false)
    })
  })

  describe('setAgentSelection', () => {
    test('sets model and effort together', () => {
      const initialRevision = useAstStore.getState().agentSelectionRevision
      useAstStore.getState().setAgentSelection('gpt-5.5', 'max')

      const s = useAstStore.getState()
      expect(s.agentModel).toBe('gpt-5.5')
      expect(s.agentEffort).toBe('max')
      expect(s.agentSelectionRevision).toBe(initialRevision + 1)
    })

    test('increments revision when reset restores defaults', () => {
      const initialRevision = useAstStore.getState().agentSelectionRevision
      useAstStore.getState().setAgentSelection('gpt-5.5', 'max')

      useAstStore.getState().reset()

      const s = useAstStore.getState()
      expect(s.agentModel).toBe('claude-opus-4-7')
      expect(s.agentEffort).toBe('high')
      expect(s.agentSelectionRevision).toBe(initialRevision + 2)
    })
  })

  describe('setZoom', () => {
    test('sets zoom level', () => {
      useAstStore.getState().setZoom(1.5)
      expect(useAstStore.getState().zoom).toBe(1.5)
    })
  })

  describe('setPan', () => {
    test('sets pan coordinates', () => {
      useAstStore.getState().setPan(100, 200)
      const s = useAstStore.getState()
      expect(s.panX).toBe(100)
      expect(s.panY).toBe(200)
    })
  })

  describe('setSearchQuery', () => {
    test('matches file names and paths', () => {
      useAstStore.getState().setRepoGraph(makeGraph())

      useAstStore.getState().setSearchQuery('components')
      expect(useAstStore.getState().searchMatches).toEqual([
        '/workspace/app/src/components/Button.tsx',
      ])

      useAstStore.getState().setSearchQuery('button')
      expect(useAstStore.getState().searchMatches).toEqual([
        '/workspace/app/src/components/Button.tsx',
      ])
    })

    test('matches nested declaration names', () => {
      useAstStore.getState().setRepoGraph(makeGraph())
      useAstStore.getState().setSearchQuery('restore')

      expect(useAstStore.getState().searchMatches).toEqual([
        '/workspace/app/src/store/session-store.ts',
      ])
    })

    test('keeps the query visible when there are no matches', () => {
      useAstStore.getState().setRepoGraph(makeGraph())
      useAstStore.getState().setSearchQuery('missing')

      const s = useAstStore.getState()
      expect(s.searchQuery).toBe('missing')
      expect(s.searchMatches).toEqual([])
    })
  })

  describe('reset', () => {
    test('restores all state to initial values', () => {
      const initialRevision = useAstStore.getState().agentSelectionRevision
      // Dirty the store
      useAstStore.getState().setScope('/some/path')
      useAstStore.getState().setRepoGraph({ files: [], edges: [] })
      useAstStore.getState().selectFile('/src/foo.ts')
      useAstStore.getState().setZoom(2)
      useAstStore.getState().setPan(50, 75)
      useAstStore.getState().toggleOverlay('deps')
      useAstStore.getState().addChatMessage({ role: 'user', content: 'hi' })
      useAstStore.getState().setAnalysisStatus('ready', 'Done')
      useAstStore.getState().setSearchQuery('foo')

      useAstStore.getState().reset()

      const s = useAstStore.getState()
      expect(s.scope).toBe('')
      expect(s.repoGraph).toBeNull()
      expect(s.selectedFile).toBeNull()
      expect(s.zoom).toBe(1)
      expect(s.panX).toBe(0)
      expect(s.panY).toBe(0)
      expect(s.activeOverlays.size).toBe(0)
      expect(s.chatMessages).toEqual([])
      expect(s.analysisStatus).toBe('idle')
      expect(s.analysisProgress).toBe('')
      expect(s.agentModel).toBe('claude-opus-4-7')
      expect(s.agentEffort).toBe('high')
      expect(s.agentSelectionRevision).toBe(initialRevision + 1)
      expect(s.searchQuery).toBe('')
      expect(s.searchMatches).toEqual([])
    })
  })
})

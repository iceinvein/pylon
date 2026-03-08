import { test, expect, describe } from 'bun:test'
import { extractChangedFiles } from './extract-changed-files'

describe('extractChangedFiles', () => {
  test('returns empty array for empty messages', () => {
    expect(extractChangedFiles([])).toEqual([])
  })

  test('ignores non-assistant messages', () => {
    const messages = [
      { type: 'user', content: [{ type: 'tool_use', name: 'Edit', input: { file_path: '/foo.ts' } }] },
      { type: 'system', content: [{ type: 'tool_use', name: 'Write', input: { file_path: '/bar.ts' } }] },
    ]
    expect(extractChangedFiles(messages)).toEqual([])
  })

  test('extracts file_path from Edit tool_use blocks', () => {
    const messages = [
      {
        type: 'assistant',
        content: [
          { type: 'tool_use', name: 'Edit', input: { file_path: '/src/app.ts' } },
        ],
      },
    ]
    expect(extractChangedFiles(messages)).toEqual(['/src/app.ts'])
  })

  test('extracts file_path from Write tool_use blocks', () => {
    const messages = [
      {
        type: 'assistant',
        content: [
          { type: 'tool_use', name: 'Write', input: { file_path: '/src/new-file.ts' } },
        ],
      },
    ]
    expect(extractChangedFiles(messages)).toEqual(['/src/new-file.ts'])
  })

  test('extracts path field as fallback', () => {
    const messages = [
      {
        type: 'assistant',
        content: [
          { type: 'tool_use', name: 'Edit', input: { path: '/src/alt.ts' } },
        ],
      },
    ]
    expect(extractChangedFiles(messages)).toEqual(['/src/alt.ts'])
  })

  test('excludes TodoWrite tool', () => {
    const messages = [
      {
        type: 'assistant',
        content: [
          { type: 'tool_use', name: 'TodoWrite', input: { file_path: '/tasks.md' } },
        ],
      },
    ]
    expect(extractChangedFiles(messages)).toEqual([])
  })

  test('deduplicates file paths', () => {
    const messages = [
      {
        type: 'assistant',
        content: [
          { type: 'tool_use', name: 'Edit', input: { file_path: '/src/app.ts' } },
          { type: 'tool_use', name: 'Edit', input: { file_path: '/src/app.ts' } },
        ],
      },
      {
        type: 'assistant',
        content: [
          { type: 'tool_use', name: 'Write', input: { file_path: '/src/app.ts' } },
        ],
      },
    ]
    expect(extractChangedFiles(messages)).toEqual(['/src/app.ts'])
  })

  test('handles message.content format (SDK messages)', () => {
    const messages = [
      {
        type: 'assistant',
        message: {
          content: [
            { type: 'tool_use', name: 'Edit', input: { file_path: '/src/nested.ts' } },
          ],
        },
      },
    ]
    expect(extractChangedFiles(messages)).toEqual(['/src/nested.ts'])
  })

  test('collects multiple distinct files across messages', () => {
    const messages = [
      {
        type: 'assistant',
        content: [
          { type: 'tool_use', name: 'Edit', input: { file_path: '/a.ts' } },
          { type: 'tool_use', name: 'Write', input: { file_path: '/b.ts' } },
        ],
      },
      {
        type: 'assistant',
        content: [
          { type: 'tool_use', name: 'Edit', input: { file_path: '/c.ts' } },
        ],
      },
    ]
    expect(extractChangedFiles(messages)).toEqual(['/a.ts', '/b.ts', '/c.ts'])
  })

  test('skips blocks without input', () => {
    const messages = [
      {
        type: 'assistant',
        content: [
          { type: 'tool_use', name: 'Edit' },
          { type: 'tool_use', name: 'Edit', input: null },
        ],
      },
    ]
    expect(extractChangedFiles(messages)).toEqual([])
  })

  test('skips non-tool_use content blocks', () => {
    const messages = [
      {
        type: 'assistant',
        content: [
          { type: 'text', text: 'Here is my edit' },
          { type: 'tool_use', name: 'Edit', input: { file_path: '/real.ts' } },
        ],
      },
    ]
    expect(extractChangedFiles(messages)).toEqual(['/real.ts'])
  })

  test('case-insensitive tool name matching', () => {
    const messages = [
      {
        type: 'assistant',
        content: [
          { type: 'tool_use', name: 'EDIT', input: { file_path: '/upper.ts' } },
          { type: 'tool_use', name: 'write', input: { file_path: '/lower.ts' } },
          { type: 'tool_use', name: 'NotebookEdit', input: { file_path: '/notebook.ipynb' } },
        ],
      },
    ]
    const result = extractChangedFiles(messages)
    expect(result).toContain('/upper.ts')
    expect(result).toContain('/lower.ts')
    expect(result).toContain('/notebook.ipynb')
  })

  test('skips entries with empty string file_path', () => {
    const messages = [
      {
        type: 'assistant',
        content: [
          { type: 'tool_use', name: 'Edit', input: { file_path: '' } },
        ],
      },
    ]
    expect(extractChangedFiles(messages)).toEqual([])
  })
})

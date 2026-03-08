import { test, expect, describe } from 'bun:test'
import { extractTasks } from './extract-tasks'

describe('extractTasks', () => {
  test('returns empty array for non-assistant messages', () => {
    expect(extractTasks({ type: 'user', content: [] })).toEqual([])
    expect(extractTasks({ type: 'system', content: [] })).toEqual([])
  })

  test('returns empty array for assistant message with no content', () => {
    expect(extractTasks({ type: 'assistant' })).toEqual([])
  })

  test('returns empty array for assistant message with no TodoWrite blocks', () => {
    const msg = {
      type: 'assistant',
      content: [
        { type: 'tool_use', name: 'Edit', input: { file_path: '/foo.ts' } },
        { type: 'text', text: 'hello' },
      ],
    }
    expect(extractTasks(msg)).toEqual([])
  })

  test('extracts tasks from TodoWrite block', () => {
    const msg = {
      type: 'assistant',
      content: [
        {
          type: 'tool_use',
          name: 'TodoWrite',
          input: {
            todos: [
              { content: 'First task', status: 'pending' },
              { content: 'Second task', status: 'in_progress' },
              { content: 'Third task', status: 'completed' },
            ],
          },
        },
      ],
    }

    const tasks = extractTasks(msg)
    expect(tasks).toHaveLength(3)
    expect(tasks[0]).toEqual({ id: '1', subject: 'First task', status: 'pending', activeForm: undefined })
    expect(tasks[1]).toEqual({ id: '2', subject: 'Second task', status: 'in_progress', activeForm: undefined })
    expect(tasks[2]).toEqual({ id: '3', subject: 'Third task', status: 'completed', activeForm: undefined })
  })

  test('preserves activeForm field', () => {
    const msg = {
      type: 'assistant',
      content: [
        {
          type: 'tool_use',
          name: 'TodoWrite',
          input: {
            todos: [
              { content: 'Task with form', status: 'in_progress', activeForm: 'editing' },
            ],
          },
        },
      ],
    }

    const tasks = extractTasks(msg)
    expect(tasks[0].activeForm).toBe('editing')
  })

  test('skips todos with invalid status', () => {
    const msg = {
      type: 'assistant',
      content: [
        {
          type: 'tool_use',
          name: 'TodoWrite',
          input: {
            todos: [
              { content: 'Valid', status: 'pending' },
              { content: 'Invalid', status: 'unknown_status' },
              { content: 'Also valid', status: 'completed' },
            ],
          },
        },
      ],
    }

    const tasks = extractTasks(msg)
    expect(tasks).toHaveLength(2)
    expect(tasks[0].subject).toBe('Valid')
    expect(tasks[1].subject).toBe('Also valid')
  })

  test('assigns 1-based IDs based on position in todos array', () => {
    const msg = {
      type: 'assistant',
      content: [
        {
          type: 'tool_use',
          name: 'TodoWrite',
          input: {
            todos: [
              { content: 'A', status: 'pending' },
              { content: 'B', status: 'completed' },
            ],
          },
        },
      ],
    }

    const tasks = extractTasks(msg)
    expect(tasks[0].id).toBe('1')
    expect(tasks[1].id).toBe('2')
  })

  test('handles message.content nested format', () => {
    const msg = {
      type: 'assistant',
      message: {
        content: [
          {
            type: 'tool_use',
            name: 'TodoWrite',
            input: {
              todos: [{ content: 'Nested task', status: 'pending' }],
            },
          },
        ],
      },
    }

    const tasks = extractTasks(msg)
    expect(tasks).toHaveLength(1)
    expect(tasks[0].subject).toBe('Nested task')
  })

  test('returns empty array when todos is not an array', () => {
    const msg = {
      type: 'assistant',
      content: [
        {
          type: 'tool_use',
          name: 'TodoWrite',
          input: { todos: 'not an array' },
        },
      ],
    }

    expect(extractTasks(msg)).toEqual([])
  })

  test('returns empty array when TodoWrite block has no input', () => {
    const msg = {
      type: 'assistant',
      content: [
        { type: 'tool_use', name: 'TodoWrite' },
      ],
    }

    expect(extractTasks(msg)).toEqual([])
  })
})

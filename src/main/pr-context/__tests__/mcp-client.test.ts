import { describe, expect, test } from 'bun:test'
import { CodeIntelligenceMcpClient } from '../mcp-client'

describe('CodeIntelligenceMcpClient', () => {
  test('connect plus callTool plus close surface exist and are typed', () => {
    const client = new CodeIntelligenceMcpClient({ command: 'echo', args: ['hi'] })
    expect(typeof client.connect).toBe('function')
    expect(typeof client.callTool).toBe('function')
    expect(typeof client.close).toBe('function')
  })
})

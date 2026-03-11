import { describe, test, expect } from 'bun:test'

describe('git-status', () => {
  describe('parseRevListOutput', () => {
    test('parses "3\\t5\\n" as ahead=3, behind=5', () => {
      const { parseRevListOutput } = require('../git-status')
      expect(parseRevListOutput('3\t5\n')).toEqual({ ahead: 3, behind: 5 })
    })

    test('parses "0\\t0\\n" as ahead=0, behind=0', () => {
      const { parseRevListOutput } = require('../git-status')
      expect(parseRevListOutput('0\t0\n')).toEqual({ ahead: 0, behind: 0 })
    })

    test('returns { ahead: 0, behind: 0 } for empty string', () => {
      const { parseRevListOutput } = require('../git-status')
      expect(parseRevListOutput('')).toEqual({ ahead: 0, behind: 0 })
    })
  })

  describe('parseLogOneline', () => {
    test('parses oneline log output into commit objects', () => {
      const { parseLogOneline } = require('../git-status')
      const input = 'abc1234 fix: resolve null check\ndef5678 feat: add button\n'
      expect(parseLogOneline(input)).toEqual([
        { hash: 'abc1234', message: 'fix: resolve null check' },
        { hash: 'def5678', message: 'feat: add button' },
      ])
    })

    test('returns empty array for empty input', () => {
      const { parseLogOneline } = require('../git-status')
      expect(parseLogOneline('')).toEqual([])
    })
  })
})

import { describe, expect, test } from 'bun:test'
import { createSqliteDatabaseWithNative, createSqliteDatabaseFromNative } from '../sqlite-adapter'

class FakeStatement {
  constructor(private readonly calls: unknown[][]) {}

  all(...params: unknown[]) {
    this.calls.push(['all', ...params])
    return [{ ok: 1 }]
  }

  get(...params: unknown[]) {
    this.calls.push(['get', ...params])
    return { ok: 1 }
  }

  run(...params: unknown[]) {
    this.calls.push(['run', ...params])
    return { changes: 1, lastInsertRowid: 7 }
  }
}

class FakeNativeDb {
  readonly calls: unknown[][] = []
  isTransaction = false

  exec(sql: string) {
    this.calls.push(['exec', sql])
  }

  prepare(sql: string) {
    this.calls.push(['prepare', sql])
    return new FakeStatement(this.calls)
  }

  close() {
    this.calls.push(['close'])
  }
}

describe('sqlite adapter', () => {
  test('omits constructor options when none are provided', () => {
    const calls: unknown[][] = []
    class FakeDatabase extends FakeNativeDb {
      constructor(path: string, options?: unknown) {
        super()
        calls.push(['constructor', arguments.length, path, options])
      }
    }

    createSqliteDatabaseWithNative(FakeDatabase, ':memory:')

    expect(calls).toEqual([['constructor', 1, ':memory:', undefined]])
  })

  test('passes constructor options when provided', () => {
    const calls: unknown[][] = []
    class FakeDatabase extends FakeNativeDb {
      constructor(path: string, options?: unknown) {
        super()
        calls.push(['constructor', arguments.length, path, options])
      }
    }
    const options = { readOnly: true }

    createSqliteDatabaseWithNative(FakeDatabase, '/tmp/pylon.db', options)

    expect(calls).toEqual([['constructor', 2, '/tmp/pylon.db', options]])
  })

  test('forwards prepare/get/all/run to the native statement', () => {
    const native = new FakeNativeDb()
    const db = createSqliteDatabaseFromNative(native)
    const stmt = db.prepare('SELECT * FROM sessions WHERE id = ?')

    expect(stmt.get('s1')).toEqual({ ok: 1 })
    expect(stmt.all('s2')).toEqual([{ ok: 1 }])
    expect(stmt.run('s3')).toEqual({ changes: 1, lastInsertRowid: 7 })
    expect(native.calls).toEqual([
      ['prepare', 'SELECT * FROM sessions WHERE id = ?'],
      ['get', 's1'],
      ['all', 's2'],
      ['run', 's3'],
    ])
  })

  test('implements pragma through native SQL', () => {
    const native = new FakeNativeDb()
    const db = createSqliteDatabaseFromNative(native)

    expect(db.pragma('foreign_keys = ON')).toEqual([{ ok: 1 }])
    expect(native.calls).toEqual([
      ['prepare', 'PRAGMA foreign_keys = ON'],
      ['all'],
    ])
  })

  test('wraps successful transactions in begin and commit', () => {
    const native = new FakeNativeDb()
    const db = createSqliteDatabaseFromNative(native)
    const save = db.transaction((id: string) => {
      db.prepare('INSERT INTO sessions (id) VALUES (?)').run(id)
      return id
    })

    expect(save('s1')).toBe('s1')
    expect(native.calls).toEqual([
      ['exec', 'BEGIN'],
      ['prepare', 'INSERT INTO sessions (id) VALUES (?)'],
      ['run', 's1'],
      ['exec', 'COMMIT'],
    ])
  })

  test('rolls back failed transactions', () => {
    const native = new FakeNativeDb()
    const db = createSqliteDatabaseFromNative(native)
    const save = db.transaction(() => {
      throw new Error('nope')
    })

    expect(() => save()).toThrow('nope')
    expect(native.calls).toEqual([
      ['exec', 'BEGIN'],
      ['exec', 'ROLLBACK'],
    ])
  })
})
